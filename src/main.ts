import { EditorView } from "@codemirror/view";
import "@styles/styles";
import { Editor, MarkdownView, Plugin } from "obsidian";
import {
	NTocRenderProps,
	updateNTocRender,
} from "./components/toc-navigator/NTocRender";
import { LL } from "./i18n/i18n";
import { createCursorListenerExtension } from "./services/cursorListenerExtension";
import { PluginSettingTab } from "./settings/PluginSettingTab";
import SettingsStore from "./settings/SettingsStore";
import { IPluginSettings } from "./types/types";
import {
	toggleFileInBlacklist,
	toggleFolderInBlacklist,
} from "./utils/blacklistManager";
import { createScrollListener } from "./utils/eventListenerManager";
import getFileHeadings from "./utils/getFileHeadings";
import {
	navigateHeading,
	returnToCursor,
	scrollTopBottom,
} from "./utils/tocToolsActions";
import updateActiveHeading from "./utils/updateActiveHeading";
import { NTocView, VIEW_TYPE_NTOC } from "./view/NTocView";

export default class NTocPlugin extends Plugin {
	settings: IPluginSettings;
	currentView = this.app.workspace.getActiveViewOfType(MarkdownView);
	readonly settingsStore = new SettingsStore(this);
	private scrollListenerCleanup: (() => void) | null = null;
	private currentFileReadingStatus = 0;
	private readingProgressSaveTimeout: NodeJS.Timeout | null = null;

	async onload() {
		await this.settingsStore.loadSettings();

		this.addSettingTab(new PluginSettingTab(this));
		this.registerView(VIEW_TYPE_NTOC, (leaf) => new NTocView(leaf, this));

		this.registerCommands();
		this.registerEvents();
		this.registerContextMenu();
		this.registerCodeblockProcessor();

		// Register CM6 cursor listener extension
		this.registerEditorExtension(createCursorListenerExtension(this));

		// Setup initial scroll listener
		this.setupScrollListener();

		this.updateNToc();
	}

	onunload() {
		this.cleanupScrollListener();
		this.app.workspace
			.getLeavesOfType(VIEW_TYPE_NTOC)
			.forEach((leaf) => leaf.detach());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * 初始化 NTocView，确保只有一个实例
	 */
	async initLeaf(): Promise<void> {
		if (this.app.workspace.getLeavesOfType(VIEW_TYPE_NTOC).length === 0) {
			const rightLeaf = this.app.workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: VIEW_TYPE_NTOC,
				});
			}
		}
		await this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(VIEW_TYPE_NTOC)[0],
		);
	}

	private registerCommands() {
		this.addCommand({
			id: "open-toc-view",
			name: LL.commands.openTocView(),
			callback: async () => {
				await this.initLeaf();
			},
		});

		this.addCommand({
			id: "return-to-cursor",
			name: LL.commands.returnToCursor(),
			editorCallback: (editor: Editor) => {
				const view = this.getActiveMarkdownView();
				if (view && editor === view.editor) {
					returnToCursor(view);
				}
			},
		});

		this.addCommand({
			id: "scroll-to-top",
			name: LL.commands.scrollToTop(),
			callback: () => {
				const view = this.getActiveMarkdownView();
				if (view) {
					scrollTopBottom(view, "top");
				}
			},
		});

		this.addCommand({
			id: "scroll-to-bottom",
			name: LL.commands.scrollToBottom(),
			callback: () => {
				const view = this.getActiveMarkdownView();
				if (view) {
					scrollTopBottom(view, "bottom");
				}
			},
		});

		this.addCommand({
			id: "navigate-previous-heading",
			name: LL.commands.navigatePreviousHeading(),
			callback: () => {
				const view = this.getActiveMarkdownView();
				if (view) {
					const headings = getFileHeadings(view);
					void navigateHeading(view, headings, "prev");
				}
			},
		});

		this.addCommand({
			id: "navigate-next-heading",
			name: LL.commands.navigateNextHeading(),
			callback: () => {
				const view = this.getActiveMarkdownView();
				if (view) {
					const headings = getFileHeadings(view);
					void navigateHeading(view, headings, "next");
				}
			},
		});

		this.addCommand({
			id: "toc-expand",
			name: LL.commands.tocExpand(),
			callback: async () => {
				await this.settingsStore.updateSettingByPath(
					"toc.alwaysExpand",
					!this.settingsStore.settings.toc.alwaysExpand,
				);
			},
		});

		// Toggle current file in hide heading number blacklist
		this.addCommand({
			id: "add-current-file-to-hide-heading-number-blacklist",
			name: LL.commands.addCurrentFileToHideHeadingNumberBlacklist(),
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					return;
				}

				const newBlacklist = toggleFileInBlacklist(
					file,
					this.settingsStore.settings.render
						.hideHeadingNumberBlacklist,
				);

				if (newBlacklist) {
					await this.settingsStore.updateSettingByPath(
						"render.hideHeadingNumberBlacklist",
						newBlacklist,
					);
				}
			},
		});

		// Toggle current folder in hide heading number blacklist
		this.addCommand({
			id: "add-current-folder-to-hide-heading-number-blacklist",
			name: LL.commands.addCurrentFolderToHideHeadingNumberBlacklist(),
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					return;
				}

				const newBlacklist = toggleFolderInBlacklist(
					file,
					this.settingsStore.settings.render
						.hideHeadingNumberBlacklist,
				);

				if (newBlacklist) {
					await this.settingsStore.updateSettingByPath(
						"render.hideHeadingNumberBlacklist",
						newBlacklist,
					);
				}
			},
		});

		// this.addCommand({
		// 	id: "insert-reading-time-card",
		// 	name: LL.commands.insertReadingTimeCard(),
		// 	editorCallback: (editor: Editor) => {
		// 		new CardCreateModal(
		// 			this.app,
		// 			JSON.stringify(DEFAULT_READING_TIME_CARD)
		// 		).open();
		// 	},
		// });

		// this.addCommand({
		// 	id: "insert-table-of-contents-card",
		// 	name: LL.commands.insertTableOfContentsCard(),
		// 	editorCallback: (editor: Editor) => {
		// 		new CardCreateModal(
		// 			this.app,
		// 			JSON.stringify(DEFAULT_TOC_CARD)
		// 		).open();
		// 	},
		// });
	}

	private registerContextMenu() {
		// this.registerEvent(
		// 	this.app.workspace.on("editor-menu", (menu, editor, view) => {
		// 		if (view instanceof MarkdownView) {
		// 			menu.addItem((item) => {
		// 				item.setTitle(LL.commands.insertReadingTimeCard());
		// 				item.setIcon("clock");
		// 				item.onClick(() => {
		// 					new CardCreateModal(
		// 						this.app,
		// 						JSON.stringify(DEFAULT_READING_TIME_CARD)
		// 					).open();
		// 				});
		// 			});
		// 			menu.addItem((item) => {
		// 				item.setTitle(LL.commands.insertTableOfContentsCard());
		// 				item.setIcon("table-of-contents");
		// 				item.onClick(() => {
		// 					new CardCreateModal(
		// 						this.app,
		// 						JSON.stringify(DEFAULT_TOC_CARD)
		// 					).open();
		// 				});
		// 			});
		// 		}
		// 	})
		// );
	}

	private registerEvents() {
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				// 如果切换到 NTocView，隐藏内联导航但保持 currentView
				if (leaf?.view.getViewType() === VIEW_TYPE_NTOC) {
					// 强制更新以触发内联导航的隐藏检查
					if (this.currentView && this.currentView.file) {
						const headings = getFileHeadings(this.currentView);
						const activeHeadingIndex = updateActiveHeading(
							this.currentView,
							headings,
						);
						this.renderNToc(this.currentView, {
							headings,
							activeHeadingIndex,
						});
					}
					return;
				}

				this.cleanupScrollListener();

				if (leaf?.view instanceof MarkdownView) {
					this.currentView = leaf.view;

					// Handling reading progress restoration
					if (
						this.settings.toc.useReadingProgress &&
						this.currentView.file
					) {
						const cache = this.app.metadataCache.getFileCache(
							this.currentView.file,
						);
						const readingStatus =
							cache?.frontmatter?.["reading-status"];

						if (
							typeof readingStatus === "number" &&
							readingStatus > 0
						) {
							// Store the status to prevent overwriting with 0/lower values immediately
							this.currentFileReadingStatus = readingStatus;

							// Scroll to position
							// Use a short delay to ensure view is ready
							setTimeout(() => {
								if (this.currentView?.contentEl) {
									const scrollEl =
										this.currentView.contentEl.querySelector(
											".cm-scroller",
										) ||
										this.currentView.contentEl.querySelector(
											".markdown-preview-view",
										);

									if (scrollEl) {
										const scrollHeight =
											scrollEl.scrollHeight;
										const clientHeight =
											scrollEl.clientHeight;
										const maxScroll =
											scrollHeight - clientHeight;
										const targetScroll =
											(readingStatus / 100) * maxScroll;

										scrollEl.scrollTo({
											top: targetScroll,
											behavior: "auto",
										});
									}
								}
							}, 200);
						} else {
							this.currentFileReadingStatus = 0;
						}
					}

					// 使用 requestAnimationFrame 延迟初始化，避免闪烁
					requestAnimationFrame(() => {
						this.setupScrollListener();
						this.updateNToc();
					});
				} else {
					// 切换到非MarkdownView（且非NTocView），清理当前TOC
					this.currentView = null;
					// 通知NTocRender销毁当前显示
					this.renderNToc(null, {
						headings: [],
						activeHeadingIndex: -1,
					});
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.updateNToc();
			}),
		);

		this.registerEvent(
			this.app.workspace.on("editor-change", (editor) => {
				if (this.currentView && this.currentView.editor === editor) {
					this.updateNToc();
				}
			}),
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (this.currentView && this.currentView.file === file) {
					const cache = this.app.metadataCache.getFileCache(file);
					const readingStatus = cache?.frontmatter?.["reading-status"];
					if (typeof readingStatus === "number") {
						this.currentFileReadingStatus = readingStatus;
					}
					this.updateNToc();
				}
			}),
		);
	}

	private registerCodeblockProcessor() {
		// this.registerMarkdownCodeBlockProcessor(
		// 	"ntoc-card",
		// 	async (code, el, ctx) => {
		// 		const processor = new CardProcessor();
		// 		processor.renderFormCodeBlock(code, el, ctx, this.app);
		// 		if (el.parentElement) {
		// 			mountEditButtonToCodeblock(
		// 				this.app,
		// 				code,
		// 				el.parentElement
		// 			);
		// 		}
		// 	}
		// );
	}

	private setupScrollListener() {
		if (!this.currentView?.contentEl) return;

		this.scrollListenerCleanup = createScrollListener(
			this.currentView.contentEl,
			{
				debounceMs: 16,
				onScroll: (event) => {
					const target = event.target as HTMLElement;
					if (
						target.classList.contains("cm-scroller") ||
						target.classList.contains("markdown-preview-view")
					) {
						this.updateNToc();

						// Handle Reading Progress
						if (this.settings.toc.useReadingProgress) {
							const scrollTop = target.scrollTop;
							const scrollHeight = target.scrollHeight;
							const clientHeight = target.clientHeight;
							const maxScroll = scrollHeight - clientHeight;

							if (maxScroll > 0) {
								const percentage = Math.round(
									(scrollTop / maxScroll) * 100,
								);

								if (this.readingProgressSaveTimeout) {
									clearTimeout(this.readingProgressSaveTimeout);
								}

								this.readingProgressSaveTimeout = setTimeout(() => {
									this.saveReadingProgress(percentage);
								}, 500); // 1s debounce for saving
							}
						}
					}
				},
			},
		);
	}

	private saveReadingProgress(percentage: number) {
		if (!this.currentView?.file || !this.settings.toc.useReadingProgress)
			return;

		// Only update if progress is significantly larger (e.g. > stored + 1%)
		// But the requirement says "only if actual value is bigger than last value"
		if (percentage > this.currentFileReadingStatus) {
			this.currentFileReadingStatus = percentage;
			this.app.fileManager.processFrontMatter(
				this.currentView.file,
				(frontmatter) => {
					frontmatter["reading-status"] = percentage;
				},
			);
		}
	}



	private cleanupScrollListener() {
		if (this.readingProgressSaveTimeout) {
			clearTimeout(this.readingProgressSaveTimeout);
			this.readingProgressSaveTimeout = null;
		}
		if (this.scrollListenerCleanup) {
			this.scrollListenerCleanup();
			this.scrollListenerCleanup = null;
		}
	}

	private getActiveMarkdownView(): MarkdownView | null {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

		// 如果当前活跃视图是 MarkdownView，更新并返回
		if (activeView) {
			return activeView;
		}

		// 否则，检查当前活跃的是否是 NTocView
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		if (activeLeaf?.view.getViewType() === VIEW_TYPE_NTOC) {
			// 如果是 NTocView，返回之前保存的 currentView
			return this.currentView;
		}

		// 其他情况返回 null
		return null;
	}

	private updateNToc() {
		if (!this.currentView || !this.currentView.file) {
			return;
		}

		// Check for required frontmatter tags
		const requiredTags = this.settings.toc.requiredFrontmatterTags;
		if (requiredTags && requiredTags.length > 0) {
			const cache = this.app.metadataCache.getFileCache(
				this.currentView.file,
			);
			const frontmatterTags = cache?.frontmatter?.tags;
			let hasRequiredTag = false;

			if (frontmatterTags) {
				const tagsArray = Array.isArray(frontmatterTags)
					? frontmatterTags
					: typeof frontmatterTags === "string"
						? frontmatterTags.split(",").map((t) => t.trim()) // Handle comma-separated string in frontmatter
						: [];

				hasRequiredTag = requiredTags.some((reqTag) =>
					tagsArray.includes(reqTag),
				);
			}

			if (!hasRequiredTag) {
				this.renderNToc(null, {
					headings: [],
					activeHeadingIndex: -1,
				});
				return;
			}
		}

		const headings = getFileHeadings(this.currentView);
		const activeHeadingIndex = updateActiveHeading(
			this.currentView,
			headings,
		);
		this.renderNToc(this.currentView, {
			headings,
			activeHeadingIndex,
		});
	}

	private renderNToc(view: MarkdownView | null, props: NTocRenderProps) {
		// 更新内联 TOC（页面内显示）
		updateNTocRender(this.settingsStore, view, props);

		// 更新侧边栏 TOC 视图
		const ntocViews = this.app.workspace.getLeavesOfType(VIEW_TYPE_NTOC);
		ntocViews.forEach((leaf) => {
			if (leaf.view instanceof NTocView) {
				leaf.view.updateTocData(
					view,
					props.headings,
					props.activeHeadingIndex,
				);
			}
		});
	}

	onCursorMoved(_view: EditorView): void {
		// Debounced via rAF in the extension. Keep minimal work here.
		// Update ToC highlighting on cursor/selection movement.
		// No await to keep it snappy; internal updateNToc uses async.
		void this.updateNToc();
	}
}
