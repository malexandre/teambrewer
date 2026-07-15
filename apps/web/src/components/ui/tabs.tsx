import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

import { cn } from "@/lib/utils";

/** One tab: a stable id, its visible label, and the panel content to reveal. */
export interface TabDefinition {
  id: string;
  label: string;
  panel: ReactNode;
}

/**
 * A minimal, accessible tabbed panel (no new dependency). It follows the WAI-ARIA
 * tabs pattern: a `role="tablist"` of `role="tab"` buttons driving a single
 * `role="tabpanel"`. Selection is controlled by the parent (`activeTabId` +
 * `onTabChange`) so the active tab can be lifted into URL/search state later.
 *
 * Keyboard support mirrors the pattern: the tablist uses a roving tabindex (only
 * the selected tab is focusable), Left/Right (and Home/End) move selection between
 * tabs, and the panel itself is focusable so keyboard users land on its content.
 */
export function Tabs({
  tabs,
  activeTabId,
  onTabChange,
  ariaLabel,
}: {
  tabs: TabDefinition[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  ariaLabel: string;
}) {
  const baseId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const tabButtonId = (tabId: string) => `${baseId}-tab-${tabId}`;
  const tabPanelId = (tabId: string) => `${baseId}-panel-${tabId}`;

  function focusTab(tabId: string): void {
    tabRefs.current.get(tabId)?.focus();
    onTabChange(tabId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab) {
      focusTab(nextTab.id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile: a single dropdown stands in for the tab strip so tabs never wrap onto
          two lines. It shares the same active-tab state as the desktop tablist below. */}
      <div className="sm:hidden">
        <select
          aria-label={ariaLabel}
          value={activeTab?.id ?? ""}
          onChange={(event) => onTabChange(event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      <div
        role="tablist"
        aria-label={ariaLabel}
        className="hidden flex-wrap gap-1 border-b border-border sm:flex"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTab?.id;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                if (element) {
                  tabRefs.current.set(tab.id, element);
                } else {
                  tabRefs.current.delete(tab.id);
                }
              }}
              type="button"
              role="tab"
              id={tabButtonId(tab.id)}
              aria-selected={isActive}
              aria-controls={tabPanelId(tab.id)}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab ? (
        <div
          role="tabpanel"
          id={tabPanelId(activeTab.id)}
          aria-labelledby={tabButtonId(activeTab.id)}
          tabIndex={0}
        >
          {activeTab.panel}
        </div>
      ) : null}
    </div>
  );
}
