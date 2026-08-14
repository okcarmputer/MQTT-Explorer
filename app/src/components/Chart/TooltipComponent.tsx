import React, { memo } from 'react'
import { alpha as fade, useTheme } from '@mui/material/styles'
import { Fade, Grow, Paper, Popper, Typography } from '@mui/material'
import { Tooltip } from './Model'

function TooltipComponent(props: { tooltip?: Tooltip }) {
  const theme = useTheme()
  const { tooltip } = props

  // Anchor near the cursor when we have its position, so the tooltip doesn't
  // render off-screen for charts near the top of the viewport (it used to
  // always anchor to the chart container's top edge via placement="top").
  // Falls back to the container element if cursor coords aren't available.
  const anchorEl =
    tooltip && tooltip.clientX !== undefined && tooltip.clientY !== undefined
      ? {
          getBoundingClientRect: () =>
            new DOMRect(tooltip.clientX, tooltip.clientY, 0, 0),
        }
      : tooltip?.element

  return (
    <Popper
      style={tooltip ? { transition: 'all 0.1s ease-out' } : undefined}
      open={Boolean(tooltip)}
      transition
      placement="right-start"
      anchorEl={anchorEl}
      modifiers={[
        { name: 'offset', enabled: true, options: { offset: [8, 12] } },
        // 'clippingParents' isn't a real Popper v2 boundary value (that was
        // the v1 name) — passing it silently fails to resolve, which is why
        // the tooltip could still get clipped near the top of a scrollable
        // panel. 'clippingAncestors' + an explicit 'viewport' rootBoundary
        // makes flip/preventOverflow reason about the actual browser
        // viewport, not just whatever ancestor happens to have overflow set.
        // Placement starts beside the cursor (not above it) so the value is
        // never hidden above the visible viewport near the top of the page.
        {
          name: 'flip',
          enabled: true,
          options: {
            fallbackPlacements: ['left-start', 'top', 'bottom'],
            boundary: 'clippingAncestors',
            rootBoundary: 'viewport',
          },
        },
        {
          name: 'preventOverflow',
          enabled: true,
          options: { boundary: 'clippingAncestors', rootBoundary: 'viewport', padding: 8, altAxis: true },
        },
      ]}
    >
      <div style={{ transition: 'all 0.5s ease' }}>
        <Fade in={Boolean(tooltip)} timeout={300}>
          <Grow in={Boolean(tooltip)} timeout={300}>
            <Paper
              style={{
                padding: '4px',
                backgroundColor: fade(
                  theme.palette.mode === 'light' ? theme.palette.background.paper : theme.palette.background.default,
                  0.7
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
    </Popper>
  )
}

export default memo(TooltipComponent)
