/** Read-only structural evidence for an explicitly selected Figma product frame. */
export async function auditFigmaFrame(figma, pageId, frameId) {
  const page = await figma.getNodeByIdAsync(pageId)
  if (!page || page.type !== 'PAGE') throw new Error('Expected a page')
  await figma.setCurrentPageAsync(page)
  const root = await figma.getNodeByIdAsync(frameId)
  if (!root || !('findAll' in root)) throw new Error('Expected a product frame')
  let ancestor = root
  while (ancestor.parent && ancestor.parent.type !== 'DOCUMENT')
    ancestor = ancestor.parent
  if (ancestor.id !== pageId)
    throw new Error('Frame is not on the requested page')
  const nodes = [root, ...root.findAll(() => true)]
  const images = []
  const masters = new Map()
  const unresolved = []
  let editableTextCount = 0
  for (const node of nodes) {
    if (node.type === 'TEXT') editableTextCount++
    if (
      'fills' in node &&
      Array.isArray(node.fills) &&
      node.fills.some((p) => p.type === 'IMAGE')
    ) {
      images.push({
        id: node.id,
        name: node.name,
        width: node.width,
        height: node.height,
      })
    }
    if (node.type !== 'INSTANCE') continue
    const master = await node.getMainComponentAsync()
    if (!master) {
      unresolved.push(node.id)
      continue
    }
    const entry = masters.get(master.id) || {
      id: master.id,
      name: master.name,
      instances: [],
    }
    entry.instances.push(node.id)
    masters.set(master.id, entry)
  }
  return {
    frameId,
    pageId,
    nodeCount: nodes.length,
    editableTextCount,
    imagePaints: images,
    unresolvedInstances: unresolved,
    masters: [...masters.values()],
    scope:
      'Structure only. Inspect every image purpose and compare actual controls/content with the app.',
  }
}
