import * as q from '../../../../backend/src/Model'

/**
 * The tree's search box (SearchBar.tsx, writing to settings.topicFilter)
 * was never actually wired to anything that filters the rendered tree —
 * a separate, permanently-undefined `tree.filter` field existed instead
 * (set once from a `showTree(tree, filter)` call that never passed a
 * filter), and TreeNodeSubnodes accepted a `filter` prop that was declared
 * but neither populated from the root nor used to exclude non-matching
 * nodes. This is the actual matching logic that was missing.
 *
 * Case-insensitive substring match against the node's full topic path
 * (e.g. "flow_monitors/15223/7"), not just its own segment name — so
 * typing a site number matches every channel under that site, not just a
 * node literally named that.
 */
export function nodeMatchesFilter(node: q.TreeNode<any>, filterLower: string): boolean {
  return node.path().toLowerCase().includes(filterLower)
}

/**
 * True if this node or any descendant matches — used to decide whether a
 * branch should render at all while filtering (hide branches with no match
 * anywhere inside them) and whether it should auto-expand to reveal a match
 * further down (see TreeNode/index.tsx).
 */
export function subtreeMatchesFilter(node: q.TreeNode<any>, filterLower: string): boolean {
  if (nodeMatchesFilter(node, filterLower)) {
    return true
  }
  return node.edgeArray.some(edge => subtreeMatchesFilter(edge.target, filterLower))
}
