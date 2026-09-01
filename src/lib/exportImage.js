import { toPng } from 'html-to-image'

export async function exportCardAsPng(element, fileName, options = {}) {
  if (!element || !(element instanceof HTMLElement)) {
    return
  }

  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  const rect = element.getBoundingClientRect()
  const width = Math.max(1, Math.ceil(rect.width || element.scrollWidth || element.offsetWidth))
  const contentHeight = Math.max(rect.height || 0, element.scrollHeight || 0, element.offsetHeight || 0)
  const height = Math.max(1, Math.ceil(contentHeight + (options.bottomPadding ?? 0)))

  const dataUrl = await toPng(element, {
    backgroundColor: '#ffffff',
    pixelRatio: options.scale ?? 2,
    width,
    height,
    cacheBust: true,
    skipFonts: false,
    style: {
      height: `${height}px`,
      overflow: 'visible',
    },
    filter: (candidate) => (
      !(candidate instanceof Element) || !candidate.hasAttribute('data-export-control')
    ),
  })

  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `${fileName}.png`
  link.click()
}
