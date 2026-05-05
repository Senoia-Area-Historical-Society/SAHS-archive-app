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
 * Processes an array of files, converting any HEIC files to PNG.
 */
export const processFilesForUpload = async (files: File[]): Promise<File[]> => {
    const processedFiles = await Promise.all(
        files.map(file => convertHeicToPng(file))
    );
    return processedFiles;
};
