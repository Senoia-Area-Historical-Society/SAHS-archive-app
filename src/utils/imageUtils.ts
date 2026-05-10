import heic2any from 'heic2any';
export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (err) => {
        // If direct load fails (likely CORS), try using weserv.nl proxy
        if (!url.includes('images.weserv.nl') && (url.startsWith('http') || url.startsWith('https'))) {
            const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&default=${encodeURIComponent(url)}`;
            image.src = proxyUrl;
        } else {
            reject(err);
        }
    })
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })

export function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180
}

/**
 * Returns the new bounding area of a rotated rectangle.
 */
export function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation)

  return {
    width:
      Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height:
      Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  }
}

/**
 * This function was adapted from the one in the react-easy-crop documentation.
 * @param {string} imageSrc - Image File url
 * @param {Object} pixelCrop - pixelCrop Object provided by react-easy-crop
 * @param {number} rotation - optional rotation parameter
 */
export default async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  rotation = 0,
  flip = { horizontal: false, vertical: false }
): Promise<Blob | null> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    return null
  }

  const rotRad = getRadianAngle(rotation)

  // calculate bounding box of the rotated image
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation
  )

  // set canvas size to match the bounding box
  canvas.width = bBoxWidth
  canvas.height = bBoxHeight

  // translate canvas context to a central point to allow rotating and flipping around the center
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2)
  ctx.rotate(rotRad)
  ctx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1)
  ctx.translate(-image.width / 2, -image.height / 2)

  // draw rotated image
  ctx.drawImage(image, 0, 0)

  // croppedAreaPixels values are bounding box relative
  // extract the cropped image using these values
  const data = ctx.getImageData(
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height
  )

  // set canvas width to final desired crop size - this will clear existing context
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  // paste generated rotate image with correct offsets for x,y crop values.
  ctx.putImageData(data, 0, 0)

  // As a blob
  return new Promise((resolve) => {
    canvas.toBlob((file) => {
      resolve(file)
    }, 'image/jpeg')
  })
}


/**
 * Converts a HEIC/HEIF file to PNG.
 * If the file is not HEIC, it returns the original file.
 */
export const convertHeicToPng = async (file: File): Promise<File> => {
    const fileName = file.name.toLowerCase();
    
    // Check if it's a HEIC/HEIF file
    if (fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
        try {
            console.log(`Converting ${file.name} to PNG...`);
            
            const blob = await heic2any({
                blob: file,
                toType: 'image/png',
                quality: 0.9
            });
            
            // heic2any can return an array if the HEIC has multiple images
            const resultBlob = Array.isArray(blob) ? blob[0] : blob;
            
            // Create a new file name with .png extension
            const newFileName = file.name.replace(/\.(heic|heif)$/i, '.png');
            
            return new File([resultBlob], newFileName, {
                type: 'image/png',
                lastModified: new Date().getTime()
            });
        } catch (error) {
            console.error('HEIC conversion failed:', error);
            return file; // Return original if conversion fails
        }
    }
    
    return file;
};

/**
 * Compresses an image file in the browser before upload.
 * It resizes the image if it exceeds max dimensions and converts it to a highly optimized format.
 */
export const compressImage = async (file: File, maxWidth = 1920, maxHeight = 1920, quality = 0.8): Promise<File> => {
    // Only compress static images (not gifs, pdfs, etc)
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
        return file;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                let { width, height } = img;
                
                // Calculate new dimensions
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    resolve(file); // Fallback to original
                    return;
                }
                
                // For transparent images (like the HEIC to PNG), fill with white so it doesn't become black in JPEG
                if (file.type === 'image/png') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }
                
                ctx.drawImage(img, 0, 0, width, height);
                
                const outType = 'image/jpeg';
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        const originalName = file.name;
                        const lastDot = originalName.lastIndexOf('.');
                        const baseName = lastDot !== -1 ? originalName.substring(0, lastDot) : originalName;
                        const newName = `${baseName}.jpg`;
                        
                        const newFile = new File([blob], newName, {
                            type: outType,
                            lastModified: Date.now()
                        });
                        resolve(newFile);
                    } else {
                        resolve(file);
                    }
                }, outType, quality);
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
};

/**
 * Processes an array of files, converting any HEIC files to PNG and compressing all images.
 */
export const processFilesForUpload = async (files: File[]): Promise<File[]> => {
    const processedFiles = await Promise.all(
        files.map(async (file) => {
            let processed = file;
            if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
                processed = await convertHeicToPng(file);
            }
            return await compressImage(processed);
        })
    );
    return processedFiles;
};
