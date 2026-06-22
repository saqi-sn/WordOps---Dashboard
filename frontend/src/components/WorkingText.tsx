import { useEffect, useState } from 'react'
import { Spinner } from './Spinner'

// Rotating reassurance text for long operations (create site, backups) so the
// user can see something is happening even without true live streaming.
const DEFAULT_MESSAGES = [
  'Cooking…',
  'Whirring the servers…',
  'Provisioning Nginx…',
  'Setting up the webroot…',
  'Downloading WordPress…',
  'Configuring PHP-FPM…',
  'Brewing caches…',
  'Tightening bolts…',
  'Almost there…',
]

export function WorkingText({ messages = DEFAULT_MESSAGES, interval = 2500 }: { messages?: string[]; interval?: number }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI(n => (n + 1) % messages.length), interval)
    return () => clearInterval(id)
  }, [messages, interval])
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Spinner /> {messages[i]}</span>
}
