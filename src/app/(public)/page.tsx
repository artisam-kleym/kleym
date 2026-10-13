import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@/components/ui'
import { env } from '@/lib/config/env'
import s from './home.module.css'

// Preserve per-request rendering: the strict CSP requires a nonce on RSC payloads.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Kleym — Send prizes with a link',
  description:
    'Create a Stellar asset campaign, set an amount for each recipient, and share individual claim links. Manage funding, claims and expired links in Kleym.',
}

const PRIZES = [
  { label: 'First place', amount: '20', tone: s.yellow },
  { label: 'Second place', amount: '15', tone: s.pink },
  { label: 'Third place', amount: '10', tone: s.mint },
  { label: 'Participant 1', amount: '5', tone: s.slate },
  { label: 'Participant 2', amount: '5', tone: s.slate },
]
const STEPS = [
  {
    title: 'Set up your campaign',
    body: 'Choose your funding wallet, asset and expiry. Give every link the same amount, or set individual prizes.',
  },
  {
    title: 'Save your links. Sign the funding.',
    body: 'Download your private CSV and keep your recovery phrase safe. Review the total, then approve the funding batches in your wallet.',
  },
  {
    title: 'Share each person’s link',
    body: 'Send recipients only their own link. They connect a supported wallet and claim. Follow confirmations from your campaign.',
  },
]
const QUESTIONS = [
  {
    title: 'Do I need recipients’ wallet addresses?',
    body: 'You can create and share open claim links without collecting addresses first. Each recipient connects their own supported wallet when claiming. Treat each link like a key: anyone who has it can claim under an open claim policy.',
  },
  {
    title: 'Can different people receive different amounts?',
    body: 'Yes. Set a default amount for the campaign, then assign custom amounts to individual links. For example, award 20, 15 and 10 USDC to prize winners, and 5 USDC to each remaining participant. Review the total before funding.',
  },
  {
    title: 'Can I use Kleym on my phone?',
    body: 'Yes. You can create campaigns and open claim links in Android Chrome with Freighter Mobile. On desktop, use the Freighter extension. Return to the original browser tab after wallet approval to follow the result. Lantern integration is being prepared and will be available after its wallet release is verified.',
  },
  {
    title: 'What happens when a link expires?',
    body: 'An expired link can no longer be claimed by its recipient. The funding owner can reclaim eligible unclaimed funds from the campaign by approving a transaction in their wallet. Expiry makes funds reclaimable; it does not automatically send them back.',
  },
  {
    title: 'What should I save before sharing?',
    body: 'Keep the complete secrets CSV and your recovery phrase private and securely backed up. The link keys are generated in your browser and are not sent to Kleym’s servers. Kleym cannot recover them for you. Share only each recipient’s individual claim URL.',
  },
]

export default function Home() {
  const testnet = env.STELLAR_NETWORK === 'testnet'
  return (
    <div className={s.home} id="top">
      <a href="#main-content" className={s.skip}>
        Skip to content
      </a>
      <header className={s.header}>
        <div className={`${s.wrap} ${s.headerInner}`}>
          <Link href="/" className={s.brand} aria-label="Kleym home">
            <Icon name="toll" size={32} filled />
            <span>Kleym</span>
          </Link>
          <nav className={s.nav} aria-label="Homepage">
            <a href="#how-it-works">How it works</a>
            <a href="#campaigns">Campaigns</a>
            <a href="#questions">Questions</a>
          </nav>
          <Link href="/login" className={s.signIn}>
            Sign in <Icon name="arrow_forward" size={16} />
          </Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className={`${s.wrap} ${s.hero}`} aria-labelledby="hero-title">
          <div className={s.heroCopy}>
            <p className={s.network}>
              <span className={s.networkDot} aria-hidden="true" />
              {testnet ? 'Testnet preview' : 'Stellar Mainnet'}
            </p>
            <h1 id="hero-title">
              A prize for everyone.
              <br />A link for each.
            </h1>
            <p className={s.lead}>
              Send USDC or XLM to your winners, contributors and community. Set
              the amounts, fund a campaign, and share a personal claim link with
              each recipient.
            </p>
            <div className={s.heroActions}>
              <Link href="/login" className={s.primary}>
                Create a campaign <Icon name="arrow_forward" size={18} />
              </Link>
              <a href="#how-it-works" className={s.textLink}>
                See how it works <Icon name="expand_more" size={18} />
              </a>
            </div>
            <p className={s.heroNote}>
              {testnet
                ? 'Try it with test assets. Test USDC has no financial value.'
                : 'Check the asset, network and amounts before approving funding.'}
            </p>
          </div>
          <figure
            className={s.preview}
            aria-label="Illustrative campaign with five custom prize amounts"
          >
            <div className={s.campaignPreview}>
              <div className={s.previewTop}>
                <span className={s.previewMark}>
                  <Icon name="campaign" size={20} />
                </span>
                <span>Community prize campaign</span>
                <span className={s.example}>Example</span>
              </div>
              <div className={s.previewHeading}>
                <div>
                  <p>Total to distribute</p>
                  <p className={s.total}>
                    55 <span>USDC</span>
                  </p>
                </div>
                <span className={s.linkCount}>
                  <Icon name="link" size={16} />5 individual links
                </span>
              </div>
              <table className={s.prizes}>
                <caption className={s.visuallyHidden}>
                  Example prize allocations
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Recipient label</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {PRIZES.map((prize, index) => (
                    <tr key={prize.label}>
                      <th scope="row">
                        <span className={`${s.prizeNumber} ${prize.tone}`}>
                          {index + 1}
                        </span>
                        {prize.label}
                      </th>
                      <td>
                        {prize.amount}
                        <span> USDC</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={s.previewBottom}>
                <Icon name="download" size={18} />
                <span>One private export. A link for every recipient.</span>
              </div>
            </div>
            <div className={s.claimPreview}>
              <span className={s.claimIcon}>
                <Icon name="redeem" size={24} />
              </span>
              <div>
                <p>Your first-place prize</p>
                <p className={s.claimAmount}>
                  20 <span>USDC</span>
                </p>
                <p className={s.claimCaption}>From a link to your wallet</p>
              </div>
              <Icon name="arrow_forward" size={20} />
            </div>
            <figcaption>
              Illustrative example. No funds are transferred here.
            </figcaption>
          </figure>
        </section>
        <div className={s.factStrip}>
          <div className={s.wrap}>
            <span>
              <Icon name="toll" size={20} />
              Built on Stellar
            </span>
            <span>
              <Icon name="link" size={20} />
              Individual claim links
            </span>
            <span>
              <Icon name="account_balance_wallet" size={20} />
              Wallet-approved funding
            </span>
          </div>
        </div>
        <section
          id="campaigns"
          className={`${s.wrap} ${s.campaigns} ${s.section}`}
          aria-labelledby="campaigns-title"
        >
          <div className={s.sectionIntro}>
            <p className={s.sectionLabel}>For campaign creators</p>
            <h2 id="campaigns-title">
              Your distribution.
              <br />
              Your way.
            </h2>
            <p>
              One campaign for the whole group, with the flexibility to make
              every prize different.
            </p>
            <Link href="/login" className={s.textLink}>
              Sign in to create a campaign{' '}
              <Icon name="arrow_forward" size={18} />
            </Link>
          </div>
          <div className={s.features}>
            <article>
              <Icon name="redeem" size={24} />
              <h3>Amounts that fit the occasion</h3>
              <p>
                Use a fixed amount for everyone or customise individual links
                for winners and participants.
              </p>
            </article>
            <article>
              <Icon name="history" size={24} />
              <h3>A clear expiry</h3>
              <p>
                Choose when claiming ends. Reclaim eligible unused funds with
                your funding wallet’s approval.
              </p>
            </article>
            <article>
              <Icon name="download" size={24} />
              <h3>Links you keep privately</h3>
              <p>
                Generate keys in your browser and save the CSV before funding.
                You control who receives each link.
              </p>
            </article>
            <article>
              <Icon name="check_circle" size={24} />
              <h3>Confirmation you can follow</h3>
              <p>
                See funding and claim status in your campaign, with public
                transaction receipts for ledger confirmation.
              </p>
            </article>
          </div>
        </section>
        <section
          id="how-it-works"
          className={s.how}
          aria-labelledby="how-title"
        >
          <div className={`${s.wrap} ${s.section}`}>
            <div className={s.howHeading}>
              <div>
                <p className={s.sectionLabel}>How it works</p>
                <h2 id="how-title">From campaign to wallet.</h2>
              </div>
              <p>
                Review the amounts, save your export, and let each recipient
                claim their own prize.
              </p>
            </div>
            <ol className={s.steps}>
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className={s.stepNumber}>{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className={s.recipient} aria-labelledby="recipient-title">
          <div className={`${s.wrap} ${s.recipientInner}`}>
            <div>
              <p className={s.sectionLabel}>For recipients</p>
              <h2 id="recipient-title">
                Got a link?
                <br />
                Your prize starts there.
              </h2>
              <p>
                Open your personal claim link on desktop or Android. Check the
                asset and amount, connect your wallet, then choose Claim.
              </p>
              <p className={s.recipientNote}>
                Use Freighter’s desktop extension or mobile app. Eligible
                sponsored claims cover network fees and required wallet setup
                without an XLM top-up.
              </p>
            </div>
            <ol className={s.recipientSteps}>
              <li>
                <Icon name="link" size={24} />
                <div>
                  <h3>Open your link</h3>
                  <p>Use the complete URL shared by the creator.</p>
                </div>
              </li>
              <li>
                <Icon name="account_balance_wallet" size={24} />
                <div>
                  <h3>Connect your wallet</h3>
                  <p>Check the receiving address and network.</p>
                </div>
              </li>
              <li>
                <Icon name="check_circle" size={24} />
                <div>
                  <h3>Claim and check the receipt</h3>
                  <p>
                    Follow any wallet approval, then return to the claim page
                    for confirmation.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>
        <section
          id="questions"
          className={`${s.wrap} ${s.section} ${s.faq}`}
          aria-labelledby="questions-title"
        >
          <div>
            <p className={s.sectionLabel}>Before you begin</p>
            <h2 id="questions-title">A few useful answers.</h2>
            <p>
              Know what to save, which wallet to use, and what happens to unused
              links.
            </p>
          </div>
          <div className={s.questions}>
            {QUESTIONS.map((question) => (
              <details key={question.title}>
                <summary>
                  {question.title}
                  <Icon name="add" size={20} />
                </summary>
                <p>{question.body}</p>
              </details>
            ))}
          </div>
        </section>
        <section
          className={`${s.wrap} ${s.finalSection}`}
          aria-labelledby="start-title"
        >
          <div className={s.finalCta}>
            <div>
              <h2 id="start-title">Make your next prize a link.</h2>
              <p>
                {testnet
                  ? 'Start with a Testnet campaign and try the complete flow.'
                  : 'Review your campaign and approve funding from your wallet.'}
              </p>
            </div>
            <Link href="/login" className={s.primary}>
              Open Kleym <Icon name="arrow_forward" size={18} />
            </Link>
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <div className={`${s.wrap} ${s.footerTop}`}>
          <div>
            <Link href="/" className={s.brand}>
              <Icon name="toll" size={24} filled />
              <span>Kleym</span>
            </Link>
            <p>Stellar assets. Personal claim links.</p>
            <p>A product by Artisam Labs.</p>
          </div>
          <nav aria-label="Footer">
            <a href="#how-it-works">How it works</a>
            <a href="#questions">Questions</a>
            <Link href="/login">Sign in</Link>
          </nav>
        </div>
        <div className={`${s.wrap} ${s.footerBottom}`}>
          <span>© {new Date().getFullYear()} Kleym</span>
          <span>
            {testnet
              ? 'Testnet preview · Test assets only'
              : 'Built on Stellar'}
          </span>
        </div>
      </footer>
    </div>
  )
}
