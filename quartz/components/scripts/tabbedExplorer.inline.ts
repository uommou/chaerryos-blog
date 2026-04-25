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
  // Build tag → posts map from frontmatter `tags` in each post's ContentDetails
  const byTag = new Map<string, Array<{ slug: FullSlug; title: string; date: Date | null }>>()

  for (const [slug, details] of entries) {
    if (slug === "index" || slug.endsWith("/index")) continue
    if (!details.tags?.length) continue

    // date arrives as an ISO string after JSON.parse, despite the Date type annotation
    const rawDate = details.date as Date | string | undefined
    const date = rawDate ? new Date(rawDate as string) : null
    const validDate = date && !Number.isNaN(date.getTime()) ? date : null

    for (const tag of details.tags) {
      const t = tag.trim()
      if (!t) continue
      if (!byTag.has(t)) byTag.set(t, [])
      byTag.get(t)!.push({ slug, title: details.title || slug, date: validDate })
    }
  }

  const sortedTags = [...byTag.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  )
  ul.innerHTML = ""

  for (const tag of sortedTags) {
    const posts = byTag.get(tag)!.sort((a, b) => {
      if (a.date && b.date) return b.date.getTime() - a.date.getTime()
      if (a.date) return -1
      if (b.date) return 1
      return a.title.localeCompare(b.title)
    })

    const li = document.createElement("li")
    const container = document.createElement("div")
    container.className = "folder-container"
    container.dataset.folderpath = `tag-${tag}`

    const svg = makeFolderSvg()
    const div = document.createElement("div")
    const btn = document.createElement("button")
    btn.className = "folder-button"
    const span = document.createElement("span")
    span.className = "folder-title"
    span.textContent = tag
    btn.appendChild(span)
    div.appendChild(btn)
    container.appendChild(svg)
    container.appendChild(div)

    const hasCurrentPage = posts.some((p) => p.slug === currentSlug)
    const storageStates = getFolderStates("tabbedExplorer-tag")
    const saved = storageStates.find((s) => s.path === `tag-${tag}`)?.collapsed
    const isCollapsed = saved !== undefined ? saved : true

    const outer = document.createElement("div")
    outer.className = "folder-outer"
    if (!isCollapsed || hasCurrentPage) outer.classList.add("open")

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
  const byYear = new Map<number, Array<{ slug: FullSlug; title: string; date: Date }>>()
  for (const [slug, details] of entries) {
    // Skip tags and folder index pages
    if (slug.startsWith("tags/")) continue
    if (slug === "index" || slug.endsWith("/index")) continue
    // date arrives as an ISO string after JSON.parse, despite the Date type annotation
    const rawDate = details.date as Date | string | undefined
    if (!rawDate) continue
    const date = new Date(rawDate as string)
    if (Number.isNaN(date.getTime())) continue
    const year = date.getFullYear()
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push({ slug, title: details.title ?? slug, date })
  }

  const sortedYears = [...byYear.keys()].sort((a, b) => b - a)
  ul.innerHTML = ""

  for (const year of sortedYears) {
    const posts = byYear.get(year)!.sort((a, b) => b.date.getTime() - a.date.getTime())
    const li = document.createElement("li")

    const container = document.createElement("div")
    container.className = "folder-container"
    container.dataset.folderpath = `year-${year}`

    const svg = makeFolderSvg()
    const div = document.createElement("div")
    const btn = document.createElement("button")
    btn.className = "folder-button"
    const span = document.createElement("span")
    span.className = "folder-title"
    span.textContent = String(year)
    btn.appendChild(span)
    div.appendChild(btn)
    container.appendChild(svg)
    container.appendChild(div)

    // Auto-open the year that contains the current page
    const hasCurrentPage = posts.some((p) => p.slug === currentSlug)
    const storageStates = getFolderStates("tabbedExplorer-year")
    const saved = storageStates.find((s) => s.path === `year-${year}`)?.collapsed
    const isCollapsed = saved !== undefined ? saved : true
    const outer = document.createElement("div")
    outer.className = "folder-outer"
    if (!isCollapsed || hasCurrentPage) outer.classList.add("open")

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
