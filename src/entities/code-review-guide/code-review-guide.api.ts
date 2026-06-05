import type {
  CodeReviewGuide,
  CodeReviewGuideGenerateRequest,
  CodeReviewGuideLookupRequest,
  RemoteCodeReviewDaemonConnectionResult,
} from './code-review-guide.types'

export const codeReviewGuideApi = {
  getGuide: (
    input: CodeReviewGuideLookupRequest,
  ): Promise<CodeReviewGuide | null> =>
    window.electronAPI.codeReviewGuide.getGuide(input),

  generateGuide: (
    input: CodeReviewGuideGenerateRequest,
  ): Promise<CodeReviewGuide> =>
    window.electronAPI.codeReviewGuide.generateGuide(input),

  refreshGuide: (
    input: CodeReviewGuideGenerateRequest,
  ): Promise<CodeReviewGuide> =>
    window.electronAPI.codeReviewGuide.refreshGuide(input),

  testRemoteDaemonConnection:
    (): Promise<RemoteCodeReviewDaemonConnectionResult> =>
      window.electronAPI.codeReviewGuide.testRemoteDaemonConnection(),
}
