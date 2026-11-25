import { describe, expect, it } from 'vitest'
import { resolveNatalTime } from './natal-civil-time'

function resolve(date: string, time: string, zone: string) {
  const { kind, instants } = resolveNatalTime(date, time, zone)
  return { kind, instants: instants.map(instant => instant.toISOString().replace('.000Z', 'Z')) }
}

describe('heure civile de naissance', () => {
  it.each([
    ['2000-02-29', '16:31', 'Europe/Paris', '2000-02-29T15:31:00Z'],
    ['2001-07-11', '00:05:01', 'Asia/Kathmandu', '2001-07-10T18:20:01Z'],
    ['1900-01-01', '00:00', 'Europe/Paris', '1899-12-31T23:50:39Z'],
    ['2100-12-31', '23:59:59', 'UTC', '2100-12-31T23:59:59Z'],
  ])('résout %s %s en %s', (date, time, zone, expected) => {
    expect(resolve(date, time, zone)).toEqual({ kind: 'exact', instants: [expected] })
  })

  it.each([
    ['2024-10-27', '02:30', 'Europe/Paris', '2024-10-27T00:30:00Z', '2024-10-27T01:30:00Z'],
    ['2024-04-07', '01:45', 'Australia/Lord_Howe', '2024-04-06T14:45:00Z', '2024-04-06T15:15:00Z'],
  ])('ordonne les deux occurrences de %s %s en %s', (date, time, zone, earlier, later) => {
    expect(resolve(date, time, zone)).toEqual({ kind: 'ambiguous', instants: [earlier, later] })
  })

  it.each([
    ['2024-03-31', '02:30', 'Europe/Paris'],
    ['2024-10-06', '02:15', 'Australia/Lord_Howe'],
    ['1972-01-07', '00:44:29', 'Africa/Monrovia'],
    ['2011-12-30', '', 'Pacific/Apia'],
    ['2011-12-30', '12:00', 'Pacific/Apia'],
  ])('détecte un saut pour %s %s en %s', (date, time, zone) => {
    expect(resolve(date, time, zone)).toEqual({ kind: 'gap', instants: [] })
  })

  it.each([
    ['2024-03-31', 'Europe/Paris', '2024-03-30T23:00:00Z', '2024-03-31T22:00:00Z'],
    ['2024-10-27', 'Europe/Paris', '2024-10-26T22:00:00Z', '2024-10-27T23:00:00Z'],
    ['2024-10-06', 'Australia/Lord_Howe', '2024-10-05T13:30:00Z', '2024-10-06T13:00:00Z'],
    ['2018-11-04', 'America/Sao_Paulo', '2018-11-04T03:00:00Z', '2018-11-05T02:00:00Z'],
    ['1972-01-07', 'Africa/Monrovia', '1972-01-07T00:44:30Z', '1972-01-08T00:00:00Z'],
    ['2011-12-29', 'Pacific/Apia', '2011-12-29T10:00:00Z', '2011-12-30T10:00:00Z'],
    ['2011-12-31', 'Pacific/Apia', '2011-12-30T10:00:00Z', '2011-12-31T10:00:00Z'],
    ['1988-10-30', 'America/St_Johns', '1988-10-30T01:30:00Z', '1988-10-31T03:30:00Z'],
  ])('renvoie les bornes extrêmes du %s en %s', (date, zone, start, end) => {
    expect(resolve(date, '', zone)).toEqual({ kind: 'day', instants: [start, end] })
  })

  it.each([
    ['1899-12-31', '00:00', 'UTC'],
    ['2101-01-01', '', 'UTC'],
    ['1900-02-29', '', 'UTC'],
    ['2024-02-30', '', 'UTC'],
    ['2024-13-01', '', 'UTC'],
    ['2024-01-01', '24:00', 'UTC'],
    ['2024-01-01', '01:60', 'UTC'],
    ['2024-01-01', '01:01:60', 'UTC'],
    ['2024-01-01', '7:05', 'UTC'],
    ['2024-01-01', '', ''],
    ['2024-01-01', '', 'Unknown/Zone'],
    ['2024-01-01', '', '+03:00'],
  ])('refuse une saisie invalide (%s, %s, %s)', (date, time, zone) => {
    expect(() => resolveNatalTime(date, time, zone)).toThrow(RangeError)
  })

  it('explique en français un identifiant de fuseau inconnu', () => {
    expect(() => resolveNatalTime('2024-01-01', '12:00', 'Unknown/Zone'))
      .toThrow('Fuseau horaire IANA inconnu sur cet appareil.')
  })
})
