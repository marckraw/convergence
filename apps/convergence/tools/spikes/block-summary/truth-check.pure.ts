// The one check lives with the app's block-sentence module (MAR-3395 CV3 A3);
// the harness imports it back so the spike and the app gate the same way.
export {
  truthCheck,
  type TruthBlock,
} from '../../../electron/backend/block-sentence/block-sentence.pure.ts'
