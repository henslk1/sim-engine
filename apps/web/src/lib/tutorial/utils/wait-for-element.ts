export function waitForElement(selector: string, timeoutMs = 8000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector)
    if (existing) { resolve(existing); return }
    const start = Date.now()
    const interval = setInterval(() => {
      const el = document.querySelector(selector)
      if (el) { clearInterval(interval); resolve(el); return }
      if (Date.now() - start > timeoutMs) { clearInterval(interval); resolve(null) }
    }, 100)
  })
}
