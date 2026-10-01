// canary: stories-titled-by-group
// Stories under a group the sidebar doesn't have: "App" is none of the seven.
import type { Meta } from '@storybook/react-vite'
import { statusStripStyles } from './status-strip.styles'

const meta = {
  title: 'App/Status strip',
  render: () => <div className={statusStripStyles.root} />,
} satisfies Meta

export default meta
