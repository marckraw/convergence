import { Button } from '../../shared/ui'
import { HOME_MOCK, INERT_CONTROL_TITLE } from './home.model'

export function HomeComposer(): React.JSX.Element {
  return (
    <section
      className="studio-composer"
      aria-label="New request"
      title={INERT_CONTROL_TITLE}
    >
      <p>{HOME_MOCK.composer.placeholder}</p>
      <div className="studio-composer-bottom">
        <button
          className="studio-small"
          type="button"
          title={INERT_CONTROL_TITLE}
          aria-disabled="true"
        >
          {HOME_MOCK.composer.tools}
        </button>
        <Button
          variant="filled"
          size="regular"
          title={INERT_CONTROL_TITLE}
          aria-disabled="true"
        >
          {HOME_MOCK.composer.send}
        </Button>
      </div>
    </section>
  )
}
