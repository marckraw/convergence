/** Static S1 design content; no conversation, inbox, or composer functionality. */
export const HOME_MOCK = {
  inboxCount: 3,
  recent: [
    ['Summer campaign', 'Ready for your review'],
    ['Q4 priorities', 'Waiting for your answer'],
    ['Checkout recovery', 'Working'],
  ],
  links: ['Explore its skills →', 'Browse knowledge →'],
  composer: {
    placeholder:
      'Describe what you need, or start with something you’ve saved.',
    tools: '+ Add a file · Choose a skill',
    send: 'Send ↑',
  },
  cards: [
    [
      'Make something',
      'Discuss a campaign brief, explore ideas and refine them in a conversation.',
    ],
    [
      'Move work forward',
      'Talk through tickets and priorities with help from GCS tools.',
    ],
    [
      'Understand a problem',
      'Investigate an issue and review the evidence before taking action.',
    ],
  ],
} as const

export const INERT_CONTROL_TITLE = 'Not available in this design build'
