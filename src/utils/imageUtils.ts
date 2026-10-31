// heic2any is dynamically imported below to reduce initial bundle size
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
 * Converts a HEIC/HEIF file to JPEG, which every browser can display; most cannot
 * show HEIC at all. Full resolution is kept. JPEG rather than PNG because HEIC is
 * itself lossy: a lossless PNG of a phone photo is several times the size of the
 * original and holds no more detail than a high-quality JPEG of it.
 * Any other file is returned unchanged.
 *
 * Nothing else is resized or re-encoded before upload. A compressImage step used
 * to redraw every image at no more than 1920px and JPEG quality 0.8, so the archive
 * kept a reduced copy instead of the scan. Smaller versions for cards and grids
 * come from the storage-resize-images extension; see src/lib/imageThumbs.ts.
 */
export const convertHeicToJpeg = async (file: File): Promise<File> => {
    const fileName = file.name.toLowerCase();

    // Check if it's a HEIC/HEIF file
    if (fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
        try {
            // Dynamic import to keep this heavy library out of the main bundle
            const heic2any = (await import('heic2any')).default;

            const blob = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.92
            });

            // heic2any can return an array if the HEIC has multiple images
            const resultBlob = Array.isArray(blob) ? blob[0] : blob;

            const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');

            return new File([resultBlob], newFileName, {
                type: 'image/jpeg',
                lastModified: new Date().getTime()
            });
        } catch (error) {
            console.error('HEIC conversion failed:', error);
            return file; // Return original if conversion fails
        }
    }
    
    return file;
};
