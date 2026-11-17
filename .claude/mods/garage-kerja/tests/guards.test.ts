import { expect, test } from 'claude-code/testing'

// Penjaga skill & rahasia garage-kerja. Hook test di bawah plugin = "mesin" yang menjalankan alat.
test('Edit file modul ditahan sampai skill modulnya dimuat', async ($, on) => {
  const ran: string[] = []
  on('tool.call', (_, e) => {
    ran.push(e.tool)
    return { result: { text: 'ok' } }
  })

  const blocked = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/components/garage/pos-view.tsx', old_string: 'a', new_string: 'b' })
  expect(blocked.deny).toBeTruthy()
  expect(String(blocked.deny)).toContain('garage-pos')
  expect(ran).toEqual([])

  await $.tool.call({ tool: 'Skill', skill: 'garage-pos' })
  const allowed = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/components/garage/pos-view.tsx', old_string: 'a', new_string: 'b' })
  expect(allowed.deny).toBeUndefined()
  expect(ran).toEqual(['Skill', 'Edit'])
})

test('File di luar modul (docs, .claude) tidak ditahan', async ($, on) => {
  on('tool.call', () => ({ result: { text: 'ok' } }))
  const res = await $.tool.call({ tool: 'Write', file_path: '/repo/docs/catatan.md', content: 'halo' })
  expect(res.deny).toBeUndefined()
})

test('Menulis kode masuk panitia ditolak tanpa menampilkan nilainya', async ($, on) => {
  on('tool.call', () => ({ result: { text: 'ok' } }))
  const code = ['GIGS', 'AB12', 'CD34'].join('-')
  const res = await $.tool.call({ tool: 'Write', file_path: '/repo/docs/akun.md', content: `Kode masuk : ${code}` })
  expect(res.deny).toBeTruthy()
  expect(String(res.deny)).toContain('kode masuk panitia GIGS')
  expect(String(res.deny)).not.toContain(code)
})
