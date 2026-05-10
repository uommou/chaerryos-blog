import { FileTrieNode } from "../../util/fileTrie"
import { FullSlug, resolveRelative, simplifySlug } from "../../util/path"
import { ContentDetails } from "../../plugins/emitters/contentIndex"

type Tab = "year" | "folder" | "tag"
type FolderState = { path: string; collapsed: boolean }

// ── Storage helpers ────────────────────────────────────────────────────────────

function getFolderStates(key: string): FolderState[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as FolderState[]
  } catch {
    return []
  }
}

function setFolderStates(key: string, states: FolderState[]) {
  localStorage.setItem(key, JSON.stringify(states))
}

// ── DOM helpers ────────────────────────────────────────────────────────────────

function makeFolderSvg(): SVGSVGElement {
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
  const p = document.createElementNS("http://www.w3.org/2000/svg", "polyline")
  p.setAttribute("points", "6 9 12 15 18 9")
  svg.appendChild(p)
  return svg
}

// ── Folder toggle ──────────────────────────────────────────────────────────────

function toggleFolder(evt: MouseEvent) {
  evt.stopPropagation()
  const target = evt.target as HTMLElement
  const isSvg = target.nodeName === "svg"
  const container = (
    isSvg ? target.parentElement : target.parentElement?.parentElement
  ) as HTMLElement | null
  if (!container?.classList.contains("folder-container")) return

  const outer = container.nextElementSibling as HTMLElement | null
  if (!outer?.classList.contains("folder-outer")) return
  outer.classList.toggle("open")

  // Persist collapsed state
  const isCollapsed = !outer.classList.contains("open")
  const storageKey =
    container.closest<HTMLElement>(".explorer-ul[data-storage-key]")?.dataset.storageKey ??
    "tabbedExplorer"
  const path = container.dataset.folderpath ?? ""
  const states = getFolderStates(storageKey)
  const entry = states.find((s) => s.path === path)
  if (entry) entry.collapsed = isCollapsed
  else states.push({ path, collapsed: isCollapsed })
  setFolderStates(storageKey, states)
}

// ── Sort ───────────────────────────────────────────────────────────────────────

function defaultSort(a: FileTrieNode, b: FileTrieNode): number {
  if ((!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)) {
    return a.displayName.localeCompare(b.displayName, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  }
  return a.isFolder ? -1 : 1
}

// ── Node builders ──────────────────────────────────────────────────────────────

function makeFileNode(currentSlug: FullSlug, node: FileTrieNode): HTMLLIElement {
  const li = document.createElement("li")
  const a = document.createElement("a")
  a.href = resolveRelative(currentSlug, node.slug)
  a.dataset.for = node.slug
  a.textContent = node.displayName
  if (currentSlug === node.slug) a.classList.add("active")
  li.appendChild(a)
  return li
}

function makeFolderNode(
  currentSlug: FullSlug,
  node: FileTrieNode,
  behavior: "collapse" | "link",
  defaultState: "collapsed" | "open",
  storageKey: string,
): HTMLLIElement {
  const li = document.createElement("li")
  const container = document.createElement("div")
  container.className = "folder-container"
  container.dataset.folderpath = node.slug

  const svg = makeFolderSvg()
  svg.addEventListener("click", toggleFolder)
  window.addCleanup(() => svg.removeEventListener("click", toggleFolder))

  const div = document.createElement("div")
  if (behavior === "link") {
    const a = document.createElement("a")
    a.href = resolveRelative(currentSlug, node.slug)
    a.dataset.for = node.slug
    a.className = "folder-title"
    a.textContent = node.displayName
    if (currentSlug === node.slug) container.classList.add("active")
    div.appendChild(a)
  } else {
    const btn = document.createElement("button")
    btn.className = "folder-button"
    const span = document.createElement("span")
    span.className = "folder-title"
    span.textContent = node.displayName
    btn.appendChild(span)
    btn.addEventListener("click", toggleFolder)
    window.addCleanup(() => btn.removeEventListener("click", toggleFolder))
    div.appendChild(btn)
  }

  container.appendChild(svg)
  container.appendChild(div)

  // Determine open/collapsed state
  const states = getFolderStates(storageKey)
  const saved = states.find((s) => s.path === node.slug)?.collapsed
  const isCollapsed = saved !== undefined ? saved : defaultState === "collapsed"
  const simple = simplifySlug(node.slug)
  const isCurrPrefix = simple === currentSlug.slice(0, simple.length)

  const outer = document.createElement("div")
  outer.className = "folder-outer"
  if (!isCollapsed || isCurrPrefix) outer.classList.add("open")

  const innerUl = document.createElement("ul")
  innerUl.className = "content"
  for (const child of node.children) {
    innerUl.appendChild(
      child.isFolder
        ? makeFolderNode(currentSlug, child, behavior, defaultState, storageKey)
        : makeFileNode(currentSlug, child),
    )
  }

  outer.appendChild(innerUl)
  li.appendChild(container)
  li.appendChild(outer)
  return li
}

// ── Panel populators ───────────────────────────────────────────────────────────

function populateFolderPanel(
  ul: HTMLUListElement,
  currentSlug: FullSlug,
  entries: [FullSlug, ContentDetails][],
  behavior: "collapse" | "link",
  defaultState: "collapsed" | "open",
) {
  const trie = FileTrieNode.fromEntries(entries)
  trie.filter((n) => n.slugSegment !== "tags")
  trie.sort(defaultSort)
  ul.innerHTML = ""
  for (const child of trie.children) {
    ul.appendChild(
      child.isFolder
        ? makeFolderNode(currentSlug, child, behavior, defaultState, "tabbedExplorer-folder")
        : makeFileNode(currentSlug, child),
    )
  }
}

function populateTagPanel(
  ul: HTMLUListElement,
  currentSlug: FullSlug,
  entries: [FullSlug, ContentDetails][],
) {
  // Build folder → { displayName, tags: Map<tagName, count> }
  // Folder display name is taken from the first segment of filePath (preserves spaces/casing)
  // Folder slug key is the first segment of the post's slug
  const folderData = new Map<string, { displayName: string; tags: Map<string, number> }>()

  for (const [slug, details] of entries) {
    if (slug === "index" || slug.endsWith("/index")) continue
    if (!details.tags?.length) continue

    const slugParts = slug.split("/")
    if (slugParts.length < 2) continue // skip root-level posts (no folder)

    const folderSlug = slugParts[0]
    // filePath fallback: use slug if filePath is missing or not a string
    const filePath = typeof details.filePath === "string" ? details.filePath : slug
    const fileParts = filePath.split("/")
    const displayName = fileParts.length > 1 ? fileParts[0] : folderSlug

    if (!folderData.has(folderSlug)) {
      folderData.set(folderSlug, { displayName, tags: new Map() })
    }
    const { tags } = folderData.get(folderSlug)!

    for (const tag of details.tags) {
      const t = tag.trim()
      if (!t) continue
      tags.set(t, (tags.get(t) ?? 0) + 1)
    }
  }

  // Sort folders alphabetically by display name
  const sortedFolders = [...folderData.keys()].sort((a, b) => {
    const da = folderData.get(a)!.displayName
    const db = folderData.get(b)!.displayName
    return da.localeCompare(db, undefined, { sensitivity: "base" })
  })

  // Determine if current page is a tag page (e.g. slug = "tags/javascript")
  const currentTag = currentSlug.startsWith("tags/") ? currentSlug.slice("tags/".length) : null

  ul.innerHTML = ""

  for (const folderSlug of sortedFolders) {
    const { displayName, tags } = folderData.get(folderSlug)!

    // Sort tags alphabetically
    const sortedTags = [...tags.keys()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    )

    const li = document.createElement("li")

    // Folder header (collapsible)
    const container = document.createElement("div")
    container.className = "folder-container"
    container.dataset.folderpath = `tagfolder-${folderSlug}`

    const svg = makeFolderSvg()
    const div = document.createElement("div")
    const btn = document.createElement("button")
    btn.className = "folder-button"
    const titleSpan = document.createElement("span")
    titleSpan.className = "folder-title"
    titleSpan.textContent = displayName
    btn.appendChild(titleSpan)
    div.appendChild(btn)
    container.appendChild(svg)
    container.appendChild(div)

    // Auto-open folder if its tag matches the current tag page
    const hasCurrTag = currentTag !== null && sortedTags.includes(currentTag)
    const storageStates = getFolderStates("tabbedExplorer-tag")
    const saved = storageStates.find((s) => s.path === `tagfolder-${folderSlug}`)?.collapsed
    const isCollapsed = saved !== undefined ? saved : true

    const outer = document.createElement("div")
    outer.className = "folder-outer"
    if (!isCollapsed || hasCurrTag) outer.classList.add("open")

    // Tag list inside folder
    const innerUl = document.createElement("ul")
    innerUl.className = "content"

    for (const tag of sortedTags) {
      const count = tags.get(tag)!
      const tagLi = document.createElement("li")

      const a = document.createElement("a")
      // Use encodeURIComponent to handle Korean/spaces in tag names
      a.href = resolveRelative(currentSlug, `tags/${encodeURIComponent(tag)}` as FullSlug)
      a.className = "tag-item"
      if (tag === currentTag) a.classList.add("active")

      const hashSpan = document.createElement("span")
      hashSpan.className = "tag-hash"
      hashSpan.textContent = "#"
      hashSpan.setAttribute("aria-hidden", "true")

      const nameSpan = document.createElement("span")
      nameSpan.className = "tag-name"
      nameSpan.textContent = tag

      const countSpan = document.createElement("span")
      countSpan.className = "tag-count"
      countSpan.textContent = String(count)

      a.appendChild(hashSpan)
      a.appendChild(nameSpan)
      a.appendChild(countSpan)
      tagLi.appendChild(a)
      innerUl.appendChild(tagLi)
    }

    outer.appendChild(innerUl)
    li.appendChild(container)
    li.appendChild(outer)
    ul.appendChild(li)

    svg.addEventListener("click", toggleFolder)
    btn.addEventListener("click", toggleFolder)
    window.addCleanup(() => {
      svg.removeEventListener("click", toggleFolder)
      btn.removeEventListener("click", toggleFolder)
    })
  }
}

function populateYearPanel(
  ul: HTMLUListElement,
  currentSlug: FullSlug,
  entries: [FullSlug, ContentDetails][],
) {
  // Group by year → month → slugs
  const byYear = new Map<number, Map<number, FullSlug[]>>()
  for (const [slug, details] of entries) {
    if (slug.startsWith("tags/")) continue
    if (slug === "index" || slug.endsWith("/index")) continue
    const rawDate = details.date as Date | string | undefined
    if (!rawDate) continue
    const date = new Date(rawDate as string)
    if (Number.isNaN(date.getTime())) continue
    const year = date.getFullYear()
    const month = date.getMonth() // 0-indexed
    if (!byYear.has(year)) byYear.set(year, new Map())
    const monthMap = byYear.get(year)!
    if (!monthMap.has(month)) monthMap.set(month, [])
    monthMap.get(month)!.push(slug as FullSlug)
  }

  const sortedYears = [...byYear.keys()].sort((a, b) => b - a)
  ul.innerHTML = ""

  for (const year of sortedYears) {
    const monthMap = byYear.get(year)!
    const allSlugsInYear = [...monthMap.values()].flat()
    const hasCurrentPage = allSlugsInYear.includes(currentSlug)

    const li = document.createElement("li")

    const container = document.createElement("div")
    container.className = "folder-container"
    container.dataset.folderpath = `year-${year}`

    const svg = makeFolderSvg()
    const div = document.createElement("div")
    const btn = document.createElement("button")
    btn.className = "folder-button"

    const titleSpan = document.createElement("span")
    titleSpan.className = "folder-title"
    titleSpan.textContent = String(year)

    btn.appendChild(titleSpan)
    div.appendChild(btn)
    container.appendChild(svg)
    container.appendChild(div)

    const storageStates = getFolderStates("tabbedExplorer-year")
    const saved = storageStates.find((s) => s.path === `year-${year}`)?.collapsed
    const isCollapsed = saved !== undefined ? saved : true

    const outer = document.createElement("div")
    outer.className = "folder-outer"
    if (!isCollapsed || hasCurrentPage) outer.classList.add("open")

    const innerUl = document.createElement("ul")
    innerUl.className = "content"

    // Sort months newest-first
    const sortedMonths = [...monthMap.keys()].sort((a, b) => b - a)

    for (const month of sortedMonths) {
      const slugsInMonth = monthMap.get(month)!
      const count = slugsInMonth.length
      const monthLabel = new Intl.DateTimeFormat("ko-KR", { month: "long" }).format(
        new Date(year, month),
      )

      const monthLi = document.createElement("li")
      const span = document.createElement("span")
      span.className = "month-item"

      const nameSpan = document.createElement("span")
      nameSpan.className = "month-name"
      nameSpan.textContent = monthLabel

      const countSpan = document.createElement("span")
      countSpan.className = "tag-count"
      countSpan.textContent = String(count)

      span.appendChild(nameSpan)
      span.appendChild(countSpan)
      monthLi.appendChild(span)
      innerUl.appendChild(monthLi)
    }

    outer.appendChild(innerUl)
    li.appendChild(container)
    li.appendChild(outer)
    ul.appendChild(li)

    svg.addEventListener("click", toggleFolder)
    btn.addEventListener("click", toggleFolder)
    window.addCleanup(() => {
      svg.removeEventListener("click", toggleFolder)
      btn.removeEventListener("click", toggleFolder)
    })
  }
}

// ── Tab switching ──────────────────────────────────────────────────────────────

function switchTab(explorer: HTMLElement, tab: Tab) {
  for (const btn of explorer.querySelectorAll<HTMLButtonElement>(".tab-btn")) {
    btn.classList.toggle("active", btn.dataset.tab === tab)
  }
  for (const panel of explorer.querySelectorAll<HTMLUListElement>(".explorer-ul[data-panel]")) {
    panel.classList.toggle("panel-active", panel.dataset.panel === tab)
  }
  sessionStorage.setItem("tabbedExplorerTab", tab)
}

// ── Explorer collapse toggle ───────────────────────────────────────────────────

function toggleExplorer(this: HTMLElement) {
  const explorer = this.closest(".explorer") as HTMLElement | null
  if (!explorer) return
  const explorerCollapsed = explorer.classList.toggle("collapsed")
  explorer.setAttribute("aria-expanded", explorerCollapsed ? "false" : "true")
  if (!explorerCollapsed) {
    document.documentElement.classList.add("mobile-no-scroll")
  } else {
    document.documentElement.classList.remove("mobile-no-scroll")
  }
}

// ── Main setup ─────────────────────────────────────────────────────────────────

async function setupTabbedExplorers(currentSlug: FullSlug) {
  const explorers = document.querySelectorAll<HTMLElement>(".tabbed-explorer")
  if (!explorers.length) return

  const data = await fetchData
  const entries = Object.entries(data) as [FullSlug, ContentDetails][]

  for (const explorer of explorers) {
    const behavior = (explorer.dataset.behavior ?? "link") as "collapse" | "link"
    const defaultState = (explorer.dataset.collapsed ?? "collapsed") as "collapsed" | "open"
    const defaultTab = (explorer.dataset.defaultTab ?? "year") as Tab

    // Restore last active tab from session (fall back to default)
    const savedTab = sessionStorage.getItem("tabbedExplorerTab") as Tab | null
    const activeTab: Tab =
      savedTab === "year" || savedTab === "folder" || savedTab === "tag" ? savedTab : defaultTab

    // Populate all panels
    const yearUl = explorer.querySelector<HTMLUListElement>('.explorer-ul[data-panel="year"]')
    const folderUl = explorer.querySelector<HTMLUListElement>('.explorer-ul[data-panel="folder"]')
    const tagUl = explorer.querySelector<HTMLUListElement>('.explorer-ul[data-panel="tag"]')

    if (yearUl) populateYearPanel(yearUl, currentSlug, entries)
    if (folderUl) populateFolderPanel(folderUl, currentSlug, entries, behavior, defaultState)
    if (tagUl) populateTagPanel(tagUl, currentSlug, entries)

    // Activate the right tab
    switchTab(explorer, activeTab)

    // Scroll restoration for active panel
    const activePanel = explorer.querySelector<HTMLUListElement>(".explorer-ul.panel-active")
    if (activePanel) {
      const scrollKey = `tabbedExplorerScroll-${activeTab}`
      const saved = sessionStorage.getItem(scrollKey)
      if (saved) {
        activePanel.scrollTop = parseInt(saved, 10)
      } else {
        activePanel.querySelector<HTMLElement>(".active")?.scrollIntoView({ behavior: "smooth" })
      }
    }

    // Tab click listeners
    for (const btn of explorer.querySelectorAll<HTMLButtonElement>(".tab-btn")) {
      const tab = btn.dataset.tab as Tab
      const handler = () => switchTab(explorer, tab)
      btn.addEventListener("click", handler)
      window.addCleanup(() => btn.removeEventListener("click", handler))
    }

    // Explorer collapse toggle
    for (const btn of explorer.getElementsByClassName(
      "explorer-toggle",
    ) as HTMLCollectionOf<HTMLElement>) {
      btn.addEventListener("click", toggleExplorer)
      window.addCleanup(() => btn.removeEventListener("click", toggleExplorer))
    }
  }
}

// Save scroll position before navigation
document.addEventListener("prenav", () => {
  const panel = document.querySelector<HTMLUListElement>(
    ".tabbed-explorer .explorer-ul.panel-active",
  )
  if (!panel) return
  const tab = panel.dataset.panel ?? "year"
  sessionStorage.setItem(`tabbedExplorerScroll-${tab}`, panel.scrollTop.toString())
})

document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  await setupTabbedExplorers(e.detail.url)

  // Collapse on mobile by default
  for (const explorer of document.querySelectorAll<HTMLElement>(".tabbed-explorer")) {
    const mobileBtn = explorer.querySelector<HTMLElement>(".mobile-explorer")
    if (mobileBtn?.checkVisibility()) {
      explorer.classList.add("collapsed")
      explorer.setAttribute("aria-expanded", "false")
      document.documentElement.classList.remove("mobile-no-scroll")
    }
    mobileBtn?.classList.remove("hide-until-loaded")
  }
})
