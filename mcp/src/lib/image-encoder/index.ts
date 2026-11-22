import sharp from 'sharp'
import { z } from 'zod'

export const RgbxImageSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    pixels: z.instanceof(Buffer),
  })
  .refine(
    ({ width, height, pixels }) =>
      Number.isSafeInteger(width * height * 4) &&
      pixels.length === width * height * 4,
    { error: 'RGBX画像の寸法と画素数が一致しません', path: ['pixels'] },
  )

export type RgbxImage = z.infer<typeof RgbxImageSchema>

export const ImageScaleSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(4),
])

export type ImageScale = z.infer<typeof ImageScaleSchema>

export const encodePng = (
  image: RgbxImage,
  scale: ImageScale = 1,
): Promise<Buffer> => {
  const { width, height, pixels } = RgbxImageSchema.parse(image)
  const parsedScale = ImageScaleSchema.parse(scale)

  const opaquePixels = Buffer.from(pixels)
  for (let index = 3; index < opaquePixels.length; index += 4) {
    opaquePixels[index] = 255
  }

  return sharp(opaquePixels, { raw: { width, height, channels: 4 } })
    .removeAlpha()
    .resize(width * parsedScale, height * parsedScale, {
      kernel: sharp.kernel.nearest,
    })
    .png()
    .toBuffer()
}
