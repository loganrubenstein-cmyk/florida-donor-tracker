import topDonors from '@/public/data/top_donors.json'
import meta from '@/public/data/meta.json'
import candidateStats from '@/public/data/candidate_stats.json'
import DonorTable from '@/components/donors/DonorTable'
import HeroCounter from '@/components/home/HeroCounter'

function formatDate(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'recently'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatBillions(n) {
  return '$' + (n / 1_000_000_000).toFixed(1) + 'B+'
}

function formatThousands(n) {
  return Math.round(n / 1000) + 'K'
}

export default function Home() {
  const updatedDate = formatDate(meta.generated_at)

  return (
    <main>
      {/* ── Hero ── */}
      <section className="m-padx" style={{
        padding: '3.5rem 2.5rem 2.5rem',
        borderBottom: '1px solid rgba(100,140,220,0.1)',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <div style={{
          fontSize: '0.6rem',
          letterSpacing: '0.18em',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          marginBottom: '1rem',
        }}>
          Florida · 1996–2026 · Public Record
        </div>

        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'clamp(2rem, 5vw, 3.2rem)',
          lineHeight: 1.05,
          color: '#fff',
          marginBottom: '1.5rem',
          fontWeight: 400,
        }}>
          <HeroCounter total={meta.total_amount} />
          <br />raised in Florida<br />politics.
        </h1>

        <p style={{
          fontSize: '0.7rem',
          color: 'var(--text-dim)',
          marginBottom: '2rem',
          maxWidth: '520px',
          lineHeight: 1.8,
        }}>
          Connecting the dots to shed light on the Sunshine State —
          who funds Florida&rsquo;s politicians, how the money flows, and what it buys.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="#donors" style={{
            background: 'var(--orange)',
            color: '#01010d',
            padding: '0.5rem 1.2rem',
            fontSize: '0.65rem',
            fontWeight: 700,
            fontFamily: 'var(--font-sans)',
            borderRadius: '3px',
            textDecoration: 'none',
            letterSpacing: '0.03em',
          }}>
            Top Donors
          </a>
          <a href="/candidates" style={{
            border: '1px solid rgba(160,192,255,0.3)',
            color: 'var(--blue)',
            padding: '0.5rem 1.2rem',
            fontSize: '0.65rem',
            borderRadius: '3px',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
          }}>
            → candidates
          </a>
          <a href="/network" style={{
            border: '1px solid rgba(100,140,220,0.2)',
            color: 'var(--text-dim)',
            padding: '0.5rem 1.2rem',
            fontSize: '0.65rem',
            borderRadius: '3px',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
          }}>
            → network
          </a>
          <span style={{ fontSize: '0.58rem', color: 'rgba(90,106,136,0.6)' }}>
            Updated {updatedDate}
          </span>
        </div>
      </section>

      {/* ── Stats Strip ── */}
      <section className="m-padx" style={{
        padding: '1.75rem 2.5rem',
        borderBottom: '1px solid rgba(100,140,220,0.1)',
        background: 'rgba(255,255,255,0.01)',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <div className="rg-4" style={{ gap: '1.5rem' }}>
          {[
            { value: formatBillions(meta.total_amount),                      label: 'total contributions\ntracked',      color: 'var(--orange)' },
            { value: formatThousands(meta.total_contributions),              label: 'individual\ntransactions',          color: 'var(--teal)'   },
            { value: meta.total_committees_with_data.toLocaleString(),       label: 'committees\nwith data',             color: 'var(--green)'  },
            { value: candidateStats.length.toLocaleString(),                 label: 'candidates\ntracked',               color: 'var(--blue)'   },
          ].map(({ value, label, color }) => (
            <div key={label}>
              <div style={{ fontSize: '1.5rem', color, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: '0.35rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Purpose ── */}
      <section className="m-padx" style={{
        padding: '2.5rem 2.5rem',
        borderBottom: '1px solid rgba(100,140,220,0.1)',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <div style={{
          fontSize: '0.6rem',
          letterSpacing: '0.15em',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
        }}>
          Why this exists
        </div>
        <div className="rg-purpose">
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text)', lineHeight: 1.85, marginBottom: '1rem' }}>
              Florida is one of the biggest political money machines in the country.
              Billions flow between donors, committees, and campaigns every cycle —
              but the trail is buried in raw government files that almost no one reads.
            </p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text)', lineHeight: 1.85 }}>
              This site pulls every contribution record from the Florida Division of
              Elections and makes it searchable, visual, and human. No spin. No agenda.
              Just the data — yours to explore.
            </p>
          </div>
          <div className="purpose-right" style={{ borderLeft: '1px solid rgba(100,140,220,0.1)', paddingLeft: '3rem' }}>
            <div style={{
              fontSize: '0.6rem',
              letterSpacing: '0.12em',
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              marginBottom: '1rem',
            }}>
              What you can find here
            </div>
            {[
              'Who gave the most, to whom, and when',
              'How money flows between donors, committees, and candidates',
              'Hard money (direct) vs. soft money (PAC) per candidate',
              'Corporate vs. individual vs. PAC donors',
              '30 years of Florida political finance',
            ].map(line => (
              <div key={line} style={{
                fontSize: '0.68rem',
                color: 'var(--text)',
                lineHeight: 2.2,
                display: 'flex',
                gap: '0.5rem',
              }}>
                <span style={{ color: 'var(--orange)' }}>→</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tool Cards ── */}
      <section className="m-padx" style={{
        padding: '2rem 2.5rem',
        borderBottom: '1px solid rgba(100,140,220,0.1)',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <div style={{
          fontSize: '0.6rem',
          letterSpacing: '0.15em',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          marginBottom: '1.25rem',
        }}>
          Explore the data
        </div>
        <div className="rg-2" style={{ gap: '1rem' }}>
          <a href="#donors" style={{ textDecoration: 'none' }}>
            <div style={{
              border: '1px solid rgba(255,176,96,0.2)',
              borderRadius: '3px',
              padding: '1.25rem',
              background: 'rgba(255,176,96,0.02)',
              height: '100%',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--orange)', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                → search donors
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                Find any donor by name. See their total giving and which committees they fund.
              </div>
            </div>
          </a>

          <a href="/network" style={{ textDecoration: 'none' }}>
            <div style={{
              border: '1px solid rgba(77,216,240,0.2)',
              borderRadius: '3px',
              padding: '1.25rem',
              background: 'rgba(77,216,240,0.02)',
              height: '100%',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                → explore network
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                Visualize the full donor-committee money network. Trace how funds flow across thousands of nodes.
              </div>
            </div>
          </a>

          <a href="/candidates" style={{ textDecoration: 'none' }}>
            <div style={{
              border: '1px solid rgba(160,192,255,0.2)',
              borderRadius: '3px',
              padding: '1.25rem',
              background: 'rgba(160,192,255,0.02)',
              height: '100%',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--blue)', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                → browse candidates
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                Every Florida candidate with campaign finance data — hard money raised, linked PACs, combined total. Filter by office, party, or cycle.
              </div>
            </div>
          </a>

          <a href="/committee/4700" style={{ textDecoration: 'none' }}>
            <div style={{
              border: '1px solid rgba(128,255,160,0.2)',
              borderRadius: '3px',
              padding: '1.25rem',
              background: 'rgba(128,255,160,0.02)',
              height: '100%',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--green)', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                → browse committees
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                Individual committee profiles — top donors, total received, entity connections, lobbyist links.
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* ── Donor Table ── */}
      <section id="donors" className="m-padx" style={{
        padding: '2.5rem 2.5rem 3rem',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <DonorTable donors={topDonors} />
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(100,140,220,0.1)',
        padding: '1rem 2.5rem',
        fontSize: '0.55rem',
        color: 'rgba(90,106,136,0.5)',
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <span>Data: Florida Division of Elections · Not affiliated with the State of Florida · All data from public records.</span>
        <span>Made in the Sunshine State</span>
      </footer>
    </main>
  )
}
