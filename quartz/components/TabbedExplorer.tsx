import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import explorerStyle from "./styles/explorer.scss"
import tabbedStyle from "./styles/tabbedExplorer.scss"
// @ts-ignore
import script from "./scripts/tabbedExplorer.inline"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"

export interface Options {
  folderDefaultState: "collapsed" | "open"
  folderClickBehavior: "collapse" | "link"
  useSavedState: boolean
  defaultTab: "year" | "folder" | "tag"
}

const defaultOptions: Options = {
  folderDefaultState: "collapsed",
  folderClickBehavior: "link",
  useSavedState: true,
  defaultTab: "tag",
}

let numTabbedExplorers = 0

export default ((userOpts?: Partial<Options>) => {
  const opts: Options = { ...defaultOptions, ...userOpts }

  const TabbedExplorer: QuartzComponent = ({ cfg, displayClass }: QuartzComponentProps) => {
    const id = `tabbed-explorer-${numTabbedExplorers++}`

    return (
      <div
        class={classNames(displayClass, "explorer", "tabbed-explorer")}
        data-behavior={opts.folderClickBehavior}
        data-collapsed={opts.folderDefaultState}
        data-savestate={opts.useSavedState}
        data-default-tab={opts.defaultTab}
      >
        {/* Mobile toggle */}
        <button
          type="button"
          class="explorer-toggle mobile-explorer hide-until-loaded"
          data-mobile={true}
          aria-controls={id}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide-menu"
          >
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>

        {/* Desktop title toggle */}
        <button
          type="button"
          class="title-button explorer-toggle desktop-explorer"
          data-mobile={false}
          aria-expanded={true}
        >
          <h2>{i18n(cfg.locale).components.explorer.title}</h2>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="5 8 14 8"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="fold"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        {/* Content */}
        <div id={id} class="explorer-content" aria-expanded={false} role="group">
          {/* Tab buttons */}
          <div class="explorer-tabs">
            <button class={`tab-btn${opts.defaultTab === "tag" ? " active" : ""}`} data-tab="tag">
              태그
            </button>
            <button class={`tab-btn${opts.defaultTab === "year" ? " active" : ""}`} data-tab="year">
              연도
            </button>
            {/* 
            <button class={`tab-btn${opts.defaultTab === "folder" ? " active" : ""}`} data-tab="folder">
              폴더
            </button>
            */}
          </div>

          {/* Tab panels — populated by inline script */}
          <ul
            class={`explorer-ul${opts.defaultTab === "tag" ? " panel-active" : ""}`}
            data-panel="tag"
            data-storage-key="tabbedExplorer-tag"
          />
          <ul
            class={`explorer-ul${opts.defaultTab === "year" ? " panel-active" : ""}`}
            data-panel="year"
            data-storage-key="tabbedExplorer-year"
          />
          {/*
          <ul
            class={`explorer-ul${opts.defaultTab === "folder" ? " panel-active" : ""}`}
            data-panel="folder"
            data-storage-key="tabbedExplorer-folder"
          />
          */}
        </div>
      </div>
    )
  }

  TabbedExplorer.css = [explorerStyle, tabbedStyle]
  TabbedExplorer.afterDOMLoaded = script
  return TabbedExplorer
}) satisfies QuartzComponentConstructor
