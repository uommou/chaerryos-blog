import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/explorer.scss"
// @ts-ignore
import script from "./scripts/yearExplorer.inline"
import { classNames } from "../util/lang"

interface Options {
  title: string
  folderDefaultState: "collapsed" | "open"
}

const defaultOptions: Options = {
  title: "Years",
  folderDefaultState: "collapsed",
}

export default ((userOpts?: Partial<Options>) => {
  const opts: Options = { ...defaultOptions, ...userOpts }

  const YearExplorer: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
    return (
      <div
        class={classNames(displayClass, "explorer")}
        data-year-explorer={true}
        data-collapsed={opts.folderDefaultState}
      >
        <button
          type="button"
          class="title-button explorer-toggle desktop-explorer"
          data-mobile={false}
          aria-expanded={true}
        >
          <h2>{opts.title}</h2>
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
        <div class="explorer-content" aria-expanded={false} role="group">
          <ul class="explorer-ul" />
        </div>
      </div>
    )
  }

  YearExplorer.css = style
  YearExplorer.afterDOMLoaded = script
  return YearExplorer
}) satisfies QuartzComponentConstructor
