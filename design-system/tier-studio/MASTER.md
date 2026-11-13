# Tier Studio design system

Based on the Minimalism & Swiss Style direction from `ui-ux-pro-max` for a creative ranking editor. The grid and violet accent carry through the library, editor, and settings. The app opens directly into the workspace, so saved projects take priority over the sample.

| Role              | Light     | Dark      |
| ----------------- | --------- | --------- |
| Workspace         | `#f8f7fb` | `#17171b` |
| Surface           | `#ffffff` | `#23232a` |
| Primary text      | `#211a2d` | `#f4f4f5` |
| Secondary text    | `#595366` | `#b2abba` |
| Primary action    | `#673bbd` | `#cab0ff` |
| On primary action | `#ffffff` | `#17171b` |
| Focus ring        | `#6135b4` | `#c6aaff` |

- Use the Segoe UI/system sans stack for headings and body so typography stays available offline.
- Use a 4/8px spacing rhythm, surface borders, and shared controls. Reserve saturated color for actions, focus, and user-selected tier colors.
- Use Lucide SVGs with accessible names on icon-only controls. Project colors choose black or white ink by contrast; export reads the same computed styles.
- Keep the library searchable and show a compact sample when the library is empty or after saved projects when it has content.
- Group editor tools by action: add items, change appearance, and undo/redo. Put progress and tier creation next to the board heading. Keep item options available without dragging.
- Collapse the sidebar to a horizontal navigation bar at narrow widths. Keep headings, actions, and toolbar groups able to wrap.
- Keep visible keyboard focus, a skip link, and reduced motion. Recheck primary text contrast in both themes and verify narrow portrait, landscape, and desktop layouts.
