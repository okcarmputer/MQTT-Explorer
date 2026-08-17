import { Theme } from '@mui/material/styles'

export const styles = (theme: Theme) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  return {
    animationLight: {
      willChange: 'auto',
      translateZ: 0,
      animation: 'updateLight 0.5s',
    },
    animationDark: {
      willChange: 'auto',
      translateZ: 0,
      animation: 'updateDark 0.5s',
    },
    collapsedSubnodes: {
      color: theme.palette.text.secondary,
    },
    displayBlock: {
      display: 'block' as const,
    },
    node: {
      display: 'block' as const,
      width: '100%',
      overflow: 'hidden' as const,
      textOverflow: 'ellipsis' as const,
      whiteSpace: 'nowrap' as const,
      padding: isMobile ? '1px 0px' : '1px 0px 0px 0px',
    },
    topicSelect: {
      float: 'right' as const,
      opacity: 0,
      cursor: 'pointer',
      marginTop: '-1px',
    },
    subnodes: {
      marginLeft: isMobile ? theme.spacing(2) : theme.spacing(1.5), // Increased indentation on mobile
    },
    // Selection/hover used to be a colored background box behind the node's
    // text (border-radius + background-color on an inline-block). That box
    // was visibly sizing itself wrong for its own text content in the
    // dashboard's panel layout — text spilling out past its background —
    // and wasn't worth chasing further, per explicit direction to just drop
    // the box and keep selection/hover as plain text styling instead
    // (bold + accent color), which can't ever visually mismatch its text.
    selected: {
      fontWeight: 700 as const,
      color: `${theme.palette.mode === 'light' ? theme.palette.primary.dark : theme.palette.primary.light} !important`,
    },
    hover: {},
    title: {
      lineHeight: isMobile ? '1.3em' : '1em',
      display: 'inline' as const,
      whiteSpace: 'nowrap' as const,
      minHeight: isMobile ? '40px' : '14px', // 44px touch target on mobile (WCAG AA minimum)
      height: 'auto' as const,
      padding: isMobile ? '8px 8px' : '1px 4px 0 4px', // Reduced padding, still touch-friendly
      margin: '1px 0px',
      fontSize: isMobile ? '16px' : 'inherit', // Prevent iOS zoom on focus
      cursor: 'pointer' as const,
      '&:hover': {
        textDecoration: 'underline' as const,
      },
      // Better touch feedback on mobile
      [theme.breakpoints.down('md')]: {
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      },
    },
  }
}
