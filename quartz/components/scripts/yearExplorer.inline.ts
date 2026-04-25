import { FullSlug, resolveRelative } from "../../util/path"

function toggleYearExplorer(this: HTMLElement) {
  const nearestExplorer = this.closest(".explorer") as HTMLElement
  if (!nearestExplorer) return
  nearestExplorer.classList.toggle("collapsed")
}

function toggleYearFolder(evt: MouseEvent) {
  evt.stopPropagation()
  const target = evt.target as HTMLElement | undefined
  if (!target) return

  const isSvg = target.nodeName === "svg"
  const folderContainer = (
    isSvg
      ? target.parentElement
      : target.parentElement?.parentElement
  ) as HTMLElement | null
  if (!folderContainer) return

  const folderOuter = folderContainer.nextElementSibling as HTMLElement | null
  if (!folderOuter) return
  folderOuter.classList.toggle("open")
}

async function setupYearExplorers(currentSlug: FullSlug) {
  const yearExplorers = document.querySelectorAll<HTMLElement>(".explorer[data-year-explorer]")
  if (!yearExplorers.length) return

  const data = await fetchData

  // Group posts by year using their date
  const byYear = new Map<number, Array<{ slug: FullSlug; title: string; date: Date }>>()
  for (const [slug, details] of Object.entries(data)) {
    const fullSlug = slug as FullSlug
    if (fullSlug.startsWith("tags/")) continue
    if (!details.date) continue
    const date = new Date(details.date)
    if (Number.isNaN(date.getTime())) continue

    const year = date.getFullYear()
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push({
      slug: fullSlug,
      title: details.title ?? fullSlug,
      date,
    })
  }

  const sortedYears = [...byYear.keys()].sort((a, b) => b - a) // newest first

  for (const explorer of yearExplorers) {
    const ul = explorer.querySelector<HTMLUListElement>(".explorer-ul")
    if (!ul) continue
    ul.innerHTML = ""

    for (const year of sortedYears) {
      const posts = byYear.get(year)!.sort((a, b) => b.date.getTime() - a.date.getTime())
      const li = document.createElement("li")

      // folder-container
      const folderContainer = document.createElement("div")
      folderContainer.className = "folder-container"

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      svg.setAttribute("width", "12")
      svg.setAttribute("height", "12")
      svg.setAttribute("viewBox", "5 8 14 8")
      svg.setAttribute("fill", "none")
      svg.setAttribute("stroke", "currentColor")
      svg.setAttribute("stroke-width", "2")
      svg.setAttribute("stroke-linecap", "round")
      svg.setAttribute("stroke-linejoin", "round")
      svg.classList.add("folder-icon")
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline")
      polyline.setAttribute("points", "6 9 12 15 18 9")
      svg.appendChild(polyline)

      const div = document.createElement("div")
      const button = document.createElement("button")
      button.className = "folder-button"
      const span = document.createElement("span")
      span.className = "folder-title"
      span.textContent = String(year)
      button.appendChild(span)
      div.appendChild(button)

      folderContainer.appendChild(svg)
      folderContainer.appendChild(div)

      // folder-outer (collapsed by default)
      const folderOuter = document.createElement("div")
      folderOuter.className = "folder-outer"
      const innerUl = document.createElement("ul")
      innerUl.className = "content"

      for (const post of posts) {
        const postLi = document.createElement("li")
        const a = document.createElement("a")
        a.href = resolveRelative(currentSlug, post.slug)
        a.dataset.for = post.slug
        a.textContent = post.title
        if (currentSlug === post.slug) a.classList.add("active")
        postLi.appendChild(a)
        innerUl.appendChild(postLi)
      }

      folderOuter.appendChild(innerUl)
      li.appendChild(folderContainer)
      li.appendChild(folderOuter)
      ul.appendChild(li)

      svg.addEventListener("click", toggleYearFolder)
      button.addEventListener("click", toggleYearFolder)
      window.addCleanup(() => {
        svg.removeEventListener("click", toggleYearFolder)
        button.removeEventListener("click", toggleYearFolder)
      })
    }

    for (const btn of explorer.getElementsByClassName(
      "explorer-toggle",
    ) as HTMLCollectionOf<HTMLElement>) {
      btn.addEventListener("click", toggleYearExplorer)
      window.addCleanup(() => btn.removeEventListener("click", toggleYearExplorer))
    }
  }
}

document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  await setupYearExplorers(e.detail.url)
})
