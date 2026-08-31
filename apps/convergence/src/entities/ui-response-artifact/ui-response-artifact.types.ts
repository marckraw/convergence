export interface ParsedUiResponseArtifact {
  title: string
  html: string
}

export interface ParsedAssistantResponse {
  markdown: string
  artifact: ParsedUiResponseArtifact | null
}

export interface UiResponseArtifact {
  id: string
  sessionId: string
  conversationItemId: string
  title: string
  kind: 'html'
  html: string
  createdAt: string
}
