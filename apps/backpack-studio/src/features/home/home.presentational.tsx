import { HomeNav } from './home-nav.presentational'
import { HomeComposer } from './home-composer.presentational'
import { HOME_MOCK, INERT_CONTROL_TITLE } from './home.model'
import type { HomeProps } from './home.types'

export function Home(props: HomeProps): React.JSX.Element {
  return (
    <div className="studio-home">
      <HomeNav {...props} />
      <div className="studio-home-main">
        <header className="studio-topbar">New conversation</header>
        <main className="studio-home-body">
          <span className="studio-ready">READY TO HELP</span>
          <h1>What would you like to get done?</h1>
          <p className="studio-intro">
            Your assistant brings GCS skills, knowledge and connected tools.
          </p>
          <HomeComposer {...props.composer} />
          <div className="studio-home-links">
            {HOME_MOCK.links.map((label) => (
              <button
                className="studio-link"
                key={label}
                type="button"
                title={INERT_CONTROL_TITLE}
                aria-disabled="true"
              >
                {label}
              </button>
            ))}
          </div>
          <h2 className="studio-section-title">
            A few things we can do together
          </h2>
          <div className="studio-home-cards">
            {HOME_MOCK.cards.map(([title, description]) => (
              <button
                className="studio-request-card"
                key={title}
                type="button"
                title={INERT_CONTROL_TITLE}
                aria-disabled="true"
              >
                <span className="studio-section-title">{title}</span>
                <span>{description}</span>
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
