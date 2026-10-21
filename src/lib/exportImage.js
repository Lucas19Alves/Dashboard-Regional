import { toPng } from 'html-to-image'

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

// As imagens saem sempre no tema claro, para ficarem iguais em qualquer tela ou impressão.
export async function withLightTheme(task) {
  const root = document.documentElement
  const wasDark = root.classList.contains('dark')
  if (wasDark) {
    root.classList.remove('dark')
    await nextFrame()
  }
  try {
    return await task()
  } finally {
    if (wasDark) root.classList.add('dark')
  }
}

export function exportCardAsPng(element, fileName, options = {}) {
  return withLightTheme(() => renderCardAsPng(element, fileName, options))
}

async function renderCardAsPng(element, fileName, options = {}) {
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
