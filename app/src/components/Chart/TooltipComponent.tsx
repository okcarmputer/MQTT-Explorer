import React, { memo } from 'react'
import { alpha as fade, useTheme } from '@mui/material/styles'
import { Fade, Grow, Paper, Typography } from '@mui/material'
import { Tooltip } from './Model'

// Pinned to the bottom-right corner of the chart's own container instead of
// following the cursor via a Popper-positioned virtual element — that
// approach kept collapsing to the top-left of the whole window (Popper's
// flip/preventOverflow modifiers couldn't resolve a stable position for a
// cursor-following virtual anchor in this app's layout, even after several
// attempted fixes). Chart.tsx's container div is already `position:
// relative`, so a plain absolutely-positioned corner anchor here is both
// simpler and immune to that whole class of bug.
function TooltipComponent(props: { tooltip?: Tooltip }) {
  const theme = useTheme()
  const { tooltip } = props

  return (
    <div
      style={{
        position: 'absolute',
        right: 8,
        bottom: 8,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <Fade in={Boolean(tooltip)} timeout={200}>
        <Grow in={Boolean(tooltip)} timeout={200}>
          <Paper
            style={{
              padding: '4px',
              backgroundColor: fade(
                theme.palette.mode === 'light' ? theme.palette.background.paper : theme.palette.background.default,
                0.85
              ),
            }}
          >
            <table style={{ lineHeight: '1.25em' }}>
              <tbody>
                {tooltip &&
                  tooltip.value.map((v: any, idx: number) => (
                    <tr key={idx}>
                      <td>
                        <Typography style={{ lineHeight: '1.2' }}>{v.title}</Typography>
                      </td>
                      <td>
                        <Typography style={{ lineHeight: '1.2' }}>{v.value}</Typography>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Paper>
        </Grow>
      </Fade>
    </div>
  )
}

export default memo(TooltipComponent)
