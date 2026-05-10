import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
import { PageList, SortFn, byDateAndAlphabetical } from "../PageList"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
import { trieFromAllFiles } from "../../util/ctx"
import { FullSlug, isFolderPath, resolveRelative } from "../../util/path"
import { Date as DateComponent, getDate } from "../Date"

interface FolderContentOptions {
  /**
   * Whether to display number of folders
   */
  showFolderCount: boolean
  showSubfolders: boolean
  sort?: SortFn
}

const defaultOptions: FolderContentOptions = {
  showFolderCount: true,
  showSubfolders: true,
}

export default ((opts?: Partial<FolderContentOptions>) => {
  const options: FolderContentOptions = { ...defaultOptions, ...opts }

  const FolderContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, allFiles, cfg } = props

    const trie = (props.ctx.trie ??= trieFromAllFiles(allFiles))
    const folder = trie.findNode(fileData.slug!.split("/"))
    if (!folder) {
      return null
    }

    const allPagesInFolder: QuartzPluginData[] =
      folder.children
        .map((node) => {
          // regular file, proceed
          if (node.data) {
            return node.data
          }

          if (node.isFolder && options.showSubfolders) {
            // folders that dont have data need synthetic files
            const getMostRecentDates = (): QuartzPluginData["dates"] => {
              let maybeDates: QuartzPluginData["dates"] | undefined = undefined
              for (const child of node.children) {
                if (child.data?.dates) {
                  // compare all dates and assign to maybeDates if its more recent or its not set
                  if (!maybeDates) {
                    maybeDates = { ...child.data.dates }
                  } else {
                    if (child.data.dates.created > maybeDates.created) {
                      maybeDates.created = child.data.dates.created
                    }

                    if (child.data.dates.modified > maybeDates.modified) {
                      maybeDates.modified = child.data.dates.modified
                    }

                    if (child.data.dates.published > maybeDates.published) {
                      maybeDates.published = child.data.dates.published
                    }
                  }
                }
              }
              return (
                maybeDates ?? {
                  created: new Date(),
                  modified: new Date(),
                  published: new Date(),
                }
              )
            }

            return {
              slug: node.slug,
              dates: getMostRecentDates(),
              frontmatter: {
                title: node.displayName,
                tags: [],
              },
            }
          }
        })
        .filter((page) => page !== undefined) ?? []

    const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? []
    const classes = cssClasses.join(" ")

    const content = (
      (tree as Root).children.length === 0
        ? fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren

    // Separate subfolders from posts
    const subfolderPages = allPagesInFolder.filter((page) => isFolderPath(page.slug ?? ""))
    const postPages = allPagesInFolder
      .filter((page) => !isFolderPath(page.slug ?? ""))
      .sort(byDateAndAlphabetical(cfg))

    // Group posts by year → month (both descending)
    const groupedByYear = new Map<number, Map<number, QuartzPluginData[]>>()
    const undatedPosts: QuartzPluginData[] = []
    for (const post of postPages) {
      const date = getDate(cfg, post)
      if (date) {
        const year = date.getFullYear()
        const month = date.getMonth()
        if (!groupedByYear.has(year)) groupedByYear.set(year, new Map())
        if (!groupedByYear.get(year)!.has(month)) groupedByYear.get(year)!.set(month, [])
        groupedByYear.get(year)!.get(month)!.push(post)
      } else {
        undatedPosts.push(post)
      }
    }
    const sortedYears = [...groupedByYear.keys()].sort((a, b) => b - a)

    const subfolderListProps = { ...props, sort: options.sort, allFiles: subfolderPages }

    return (
      <div class="popover-hint">
        <article class={classes}>{content}</article>
        <div class="page-listing">
          {options.showFolderCount && (
            <p>
              {i18n(cfg.locale).pages.folderContent.itemsUnderFolder({
                count: allPagesInFolder.length,
              })}
            </p>
          )}
          <div>
            {subfolderPages.length > 0 && <PageList {...subfolderListProps} />}
            {sortedYears.map((year) => {
              const monthMap = groupedByYear.get(year)!
              const sortedMonths = [...monthMap.keys()].sort((a, b) => b - a)
              return (
                <div class="year-group">
                  <h3 class="year-header">{year}</h3>
                  {sortedMonths.map((month) => {
                    const monthPosts = monthMap.get(month)!
                    const monthLabel = new Intl.DateTimeFormat(cfg.locale, {
                      month: "long",
                    }).format(new Date(year, month))
                    return (
                      <div class="month-group">
                        <h4 class="month-header">{monthLabel}</h4>
                        <ul class="section-ul">
                          {monthPosts.map((page) => {
                            const title = page.frontmatter?.title
                            const tags = page.frontmatter?.tags ?? []
                            const date = getDate(cfg, page)
                            return (
                              <li class="section-li">
                                <div class="section-row">
                                  <a
                                    href={resolveRelative(fileData.slug!, page.slug!)}
                                    class="internal section-title"
                                  >
                                    {title}
                                  </a>
                                  {date && (
                                    <span class="section-date">
                                      <DateComponent date={date} locale={cfg.locale} />
                                    </span>
                                  )}
                                </div>
                                {tags.length > 0 && (
                                  <ul class="tags">
                                    {tags.map((tag) => (
                                      <li>
                                        <a
                                          class="internal tag-link"
                                          href={resolveRelative(
                                            fileData.slug!,
                                            `tags/${tag}` as FullSlug,
                                          )}
                                        >
                                          {tag}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {undatedPosts.length > 0 && (
              <PageList {...{ ...props, sort: options.sort, allFiles: undatedPosts }} />
            )}
          </div>
        </div>
      </div>
    )
  }

  FolderContent.css = concatenateResources(style, PageList.css)
  return FolderContent
}) satisfies QuartzComponentConstructor
