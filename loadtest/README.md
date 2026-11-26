# Vardenia load tests (k6)

Staging only. Read the header comment of each script before running it.

Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/ (Linux: the apt
repository or the snap/binary from that page). Check with `k6 version`.

| Script          | What it proves                                                                     | Writes data?                  |
| --------------- | ---------------------------------------------------------------------------------- | ----------------------------- |
| browse.js       | Home, directory and a listing page under 10 to 30 visitors                         | No                            |
| availability.js | /booking/availability at 4 requests/s for 3 minutes (the per-address limit is 5/s) | No                            |
| booking-race.js | Never more bookings than capacity when many ask for the same slot                  | YES: real bookings and emails |

Order: browse, then availability, then (after telling your teammate) booking-race.

Credentials go in your terminal only: `-e WALL_USER=... -e WALL_PASS=...` for the
staging access wall if it is basic auth, `-e COOKIES=...` for test customers.
Never paste them into chat or commit them. The scripts refuse a BASE that looks
like production (edit PROD_HOSTS with -e if your production host differs).

Watch while a test runs: Supabase > Database > Connections (connection count),
Netlify > Logs > Functions (durations, errors), and k6's own summary at the end.
A result is only meaningful with a number next to it: write down p95, error
rate, and the point where it degraded.
