import React, { useEffect, useState, useMemo } from 'react'
import { Theme } from '@mui/material/styles'
import { withStyles } from '@mui/styles'
import * as q from '../../../../../backend/src/Model'
import TreeNode from '.'
import { SettingsState } from '../../../reducers/Settings'
import { sortedNodes } from '../../../sortedNodes'
import { TopicViewModel } from '../../../model/TopicViewModel'
import { treeActions } from '../../../actions'
import { subtreeMatchesFilter } from '../topicFilter'

export interface Props {
  treeNode: q.TreeNode<TopicViewModel>
  filter?: string
  classes: any
  lastUpdate: number
  selectedTopic?: q.TreeNode<TopicViewModel>
  selectTopicAction: (treeNode: q.TreeNode<any>) => void
  settings: SettingsState
  actions: typeof treeActions
  theme: Theme
}

function useStagedRendering(treeNode: q.TreeNode<any>) {
  const [alreadyAdded, setAlreadyAdded] = useState(10)
  const edges = treeNode.edgeArray

  useEffect(() => {
    let renderMoreAnimationFrame: any

    if (alreadyAdded < edges.length) {
      renderMoreAnimationFrame = (window as any).requestIdleCallback(
        () => {
          setAlreadyAdded(Math.max(25, alreadyAdded * 1.5))
        },
        { timeout: 500 }
      )
    }

    return function cleanup() {
      ;(window as any).cancelIdleCallback(renderMoreAnimationFrame)
    }
  }, [alreadyAdded, edges.length])

  return alreadyAdded
}

function TreeNodeSubnodes(props: Props) {
  const alreadyAdded = useStagedRendering(props.treeNode)

  return useMemo(() => {
    const filterLower = props.filter ? props.filter.trim().toLowerCase() : ''
    const allNodes = sortedNodes(props.settings, props.treeNode)
    // Branches with no match anywhere inside them are excluded entirely
    // while filtering — not just visually collapsed, actually not rendered
    // — so the tree reads as "only what's being listened to that matches".
    const matchingNodes = filterLower ? allNodes.filter(node => subtreeMatchesFilter(node, filterLower)) : allNodes
    const nodes = matchingNodes.slice(0, alreadyAdded)
    const listItems = nodes.map(node => (
      <TreeNode
        key={`${node.hash()}-${props.filter}`}
        treeNode={node}
        lastUpdate={node.lastUpdate}
        selectTopicAction={props.selectTopicAction}
        settings={props.settings}
        actions={props.actions}
        filter={props.filter}
      />
    ))

    return <span className={props.classes.list}>{listItems}</span>
  }, [alreadyAdded, props.treeNode.lastUpdate, props.theme, props.settings, props.filter])
}

const styles = (theme: Theme) => ({
  list: {
    display: 'block' as const,
    clear: 'both' as const,
    marginLeft: theme.spacing(1.5),
  },
})

export default withStyles(styles, { withTheme: true })(TreeNodeSubnodes)
