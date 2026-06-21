pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let fabricCanvases = []; 
let originalPdfBytes; 
let activeCanvasIndex = 0; 

const pdfUpload = document.getElementById('pdf-upload');
const imageUpload = document.getElementById('image-upload');
const textBtn = document.getElementById('text-btn');
const saveBtn = document.getElementById('save-btn');
const pdfContainer = document.getElementById('pdf-container');

// 1. PDF YÜKLEME VE SAYFALARI OLUŞTURMA
pdfUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    pdfContainer.innerHTML = "PDF Sayfaları Yükleniyor...";
    fabricCanvases = [];

    const fileReader = new FileReader();
    fileReader.onload = async function() {
        originalPdfBytes = new Uint8Array(this.result);
        const loadingTask = pdfjsLib.getDocument(originalPdfBytes);
        const pdf = await loadingTask.promise;
        pdfContainer.innerHTML = ""; 

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            const wrapper = document.createElement('div');
            wrapper.className = 'page-wrapper';
            wrapper.style.width = viewport.width + 'px';
            wrapper.style.height = viewport.height + 'px';

            const label = document.createElement('div');
            label.className = 'page-label';
            label.innerText = `Sayfa ${pageNum}`;
            wrapper.appendChild(label);

            const canvasElement = document.createElement('canvas');
            canvasElement.id = `canvas-page-${pageNum}`;
            wrapper.appendChild(canvasElement);
            pdfContainer.appendChild(wrapper);

            const renderCanvas = document.createElement('canvas');
            const context = renderCanvas.getContext('2d');
            renderCanvas.height = viewport.height;
            renderCanvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const fCanvas = new fabric.Canvas(canvasElement.id, {
                width: viewport.width,
                height: viewport.height
            });

            fabric.Image.fromURL(renderCanvas.toDataURL(), function(img) {
                fCanvas.setBackgroundImage(img, fCanvas.renderAll.bind(fCanvas));
            });

            const currentIndex = pageNum - 1;
            fCanvas.on('mouse:down', () => {
                activeCanvasIndex = currentIndex;
                document.querySelectorAll('.page-wrapper').forEach((el, idx) => {
                    el.style.borderColor = idx === currentIndex ? '#007bff' : '#ccc';
                });
            });

            fabricCanvases.push(fCanvas);
        }

        if(document.querySelector('.page-wrapper')) {
            document.querySelector('.page-wrapper').style.borderColor = '#007bff';
        }

        imageUpload.disabled = false;
        textBtn.disabled = false;
        saveBtn.disabled = false;
    };
    fileReader.readAsArrayBuffer(file);
});

// 2a. AKTİF SAYFAYA RESİM EKLEME
imageUpload.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length === 0) return;

    const currentCanvas = fabricCanvases[activeCanvasIndex];

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(f) {
            const data = f.target.result;
            fabric.Image.fromURL(data, function(img) {
                img.scaleToWidth(200);
                currentCanvas.add(img);
                currentCanvas.setActiveObject(img);
                currentCanvas.renderAll();
            });
        };
        reader.readAsDataURL(file);
    });
    imageUpload.value = '';
});

// 2b. AKTİF SAYFAYA METİN EKLEME
textBtn.addEventListener('click', () => {
    const currentCanvas = fabricCanvases[activeCanvasIndex];
    if (!currentCanvas) return;

    const textbox = new fabric.Textbox('Çift tıklayıp yazın', {
        left: 100,
        top: 100,
        width: 250,
        fontSize: 20,
        fill: '#000000', 
        fontFamily: 'sans-serif',
        hasRotatingPoint: true
    });

    currentCanvas.add(textbox);
    currentCanvas.setActiveObject(textbox);
    currentCanvas.renderAll();
});

// 3. MÜKEMMEL HİZALAMALI PDF KAYDETME FONKSİYONU
saveBtn.addEventListener('click', async () => {
    if (!originalPdfBytes) return;

    saveBtn.innerText = "Kaydediliyor...";
    saveBtn.disabled = true;

    try {
        const { PDFDocument, degrees, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(originalPdfBytes);
        
        // Fontkit Doğrulaması
        if (typeof window.fontkit === 'undefined') {
            throw new Error("Fontkit kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.");
        }
        pdfDoc.registerFontkit(window.fontkit);

        const pages = pdfDoc.getPages();

        // En kararlı, çökme yaratmayan doğrudan font linki (cdnjs pdfmake altından)
        const fontUrl = '/Roboto-Regular.ttf';
        const response = await fetch(fontUrl);
        if (!response.ok) throw new Error("Yazı tipi (TTF) uzaktaki sunucudan indirilemedi.");
        
        const fontBytes = await response.arrayBuffer();
        const customFont = await pdfDoc.embedFont(fontBytes);

        for (let i = 0; i < pages.length; i++) {
            const pdfPage = pages[i];
            const fCanvas = fabricCanvases[i];

            if (!fCanvas) continue;

            const { width: pdfWidth, height: pdfHeight } = pdfPage.getSize();
            const scale = pdfWidth / fCanvas.width;
            const objects = fCanvas.getObjects();

            for (let obj of objects) {
                // RESİM İŞLEME
                if (obj.type === 'image') {
                    const base64Data = obj.getSrc();
                    let pdfImage;
                    
                    if (base64Data.includes('image/jpeg') || base64Data.includes('image/jpg')) {
                        pdfImage = await pdfDoc.embedJpg(base64Data);
                    } else {
                        pdfImage = await pdfDoc.embedPng(base64Data);
                    }

                    const imgWidth = obj.getScaledWidth() * scale;
                    const imgHeight = obj.getScaledHeight() * scale;
                    const x = obj.left * scale;
                    const y = pdfHeight - (obj.top * scale) - imgHeight; 

                    pdfPage.drawImage(pdfImage, {
                        x: x,
                        y: y,
                        width: imgWidth,
                        height: imgHeight,
                        rotate: degrees(-obj.angle), 
                    });
                } 
                // KUSURSUZ METİN İŞLEME
                else if (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text') {
                    const textLines = obj.textLines || (obj._textLines ? obj._textLines.map(l => typeof l === 'string' ? l : l.text) : [obj.text]);
                    const fullText = textLines.join('\n');
                    
                    const fontSize = obj.fontSize * scale * (obj.scaleX || 1);
                    
                    // PDF-Lib'de metin hizalaması baseline (taban çizgisi) üzerinden yapılır.
                    // Ascent fonksiyonu yerine evrensel font baseline oranı (0.75) kullanılır.
                    const textBaselineOffset = fontSize * 0.75; 
                    const lineHeight = (obj.lineHeight || 1.16) * fontSize;

                    const angleRad = (obj.angle * Math.PI) / 180;
                    
                    const x0 = obj.left * scale;
                    const y0 = pdfHeight - (obj.top * scale);

                    // Döndürme eksenini baseline oranına göre hesapla
                    const x = x0 - textBaselineOffset * Math.sin(angleRad);
                    const y = y0 - textBaselineOffset * Math.cos(angleRad);

                    pdfPage.drawText(fullText, {
                        x: x,
                        y: y,
                        size: fontSize,
                        font: customFont, 
                        color: rgb(0, 0, 0), 
                        lineHeight: lineHeight,
                        rotate: degrees(-obj.angle || 0),
                    });
                }
            }
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'duzenlenmis_dokuman.pdf';
        link.click();

    } catch (error) {
        console.error("Hata Detayı:", error);
        alert("Hata oluştu: " + error.message);
    } finally {
        saveBtn.innerText = "3. PDF Olarak Kaydet";
        saveBtn.disabled = false;
    }
});