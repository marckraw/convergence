// Copies in a story never count either: the expected output names three copies, not four.
import { Panel } from './panel'

const meta = { title: 'Primitives/Panel', component: Panel }

export default meta

export const Default = {
  render: () => (
    <div className="flex items-center justify-between gap-3 px-4 py-2" />
  ),
}
