'use client'

/* eslint-disable max-lines */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { z } from 'zod'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  ContactCreatedSchema, ContactUpdatedSchema, MissionCreatedSchema, MissionUpdatedSchema,
  MatchesResponseSchema, OwnProfileResponseSchema,
  type OwnProfile, type MutualAidMatch, type Mission, type ContactRequest,
} from '@/lib/entraide-contracts'
import {
  createEntraideSession, isEntraideCancellation, EntraideTimeoutError,
  type EntraideSession, type EntraideOperation,
} from '@/lib/entraide-client'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import Tabs from '@/components/ui/Tabs'
import EmptyState from '@/components/ui/EmptyState'
import { Loader2, Users, Target, MessageCircle, Plus, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function EntraidePage() {
  const { session, loading } = useAuth()
  if (!session) {
    return loading ? (
      <div role="status" aria-label="Chargement de la session" className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    ) : <p role="alert" className="p-8">Connectez-vous pour accéder au réseau Entraide.</p>
  }
  return <EntraideWorkspace key={session.user.id} session={session} />
}

function EntraideWorkspace({ session }: { session: Session }) {
  const [supabase] = useState(createClient)
  const userId = session.user.id
  const accessToken = session.access_token
  const [authEpoch, setAuthEpoch] = useState(0)
  const [sessionMismatch, setSessionMismatch] = useState(false)
  const [activeTab, setActiveTab] = useState('profil')
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadErrors, setLoadErrors] = useState<string[]>([])
  const [profileReady, setProfileReady] = useState(false)
  const [profile, setProfile] = useState<OwnProfile | null>(null)
  const [skillsOffered, setSkillsOffered] = useState('')
  const [skillsNeeded, setSkillsNeeded] = useState('')
  const [availabilityDays, setAvailabilityDays] = useState<string[]>([])
  const [matches, setMatches] = useState<MutualAidMatch[]>([])
  const [matchesReady, setMatchesReady] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [missions, setMissions] = useState<Mission[]>([])
  const [missionsReady, setMissionsReady] = useState(false)
  const [contactsReady, setContactsReady] = useState(false)
  const [newMissionTitle, setNewMissionTitle] = useState('')
  const [newMissionDesc, setNewMissionDesc] = useState('')
  const [newMissionMin, setNewMissionMin] = useState(2)
  const [contactsReceived, setContactsReceived] = useState<ContactRequest[]>([])
  const [contactsSent, setContactsSent] = useState<ContactRequest[]>([])
  const requestSession = useRef<EntraideSession | null>(null)
  const currentLoad = useRef<EntraideOperation | null>(null)
  const currentMutation = useRef<EntraideOperation | null>(null)
  const profileHydrated = useRef(false)
  const profileRevision = useRef(0)
  const missionRevision = useRef(0)

  const loadData = useCallback(async (scope = requestSession.current) => {
    if (!scope) return
    currentLoad.current?.cancel()
    const operation = scope.start()
    currentLoad.current = operation
    setSessionMismatch(false)
    setLoading(true)
    setProfileReady(false)
    setMissionsReady(false)
    setContactsReady(false)
    setMatchesReady(false)
    setMatches([])
    setTruncated(false)
    try {
      const [ownResult, matchResult, missionResult, contactResult] = await Promise.allSettled([
        operation.request('profile', OwnProfileResponseSchema),
        operation.request('matches', MatchesResponseSchema),
        operation.missions(),
        operation.contacts(),
      ])
      await operation.assertCurrent()
      if (currentLoad.current !== operation || requestSession.current !== scope) return
      const errors: string[] = []
      if (ownResult.status === 'fulfilled' &&
          (!ownResult.value.profile || ownResult.value.profile.user_id === userId)) {
        const own = ownResult.value.profile
        setProfile(own)
        setProfileReady(true)
        if (!profileHydrated.current && profileRevision.current === 0) {
          setSkillsOffered(own?.skills_offered.join(', ') ?? '')
          setSkillsNeeded(own?.skills_needed.join(', ') ?? '')
          setAvailabilityDays(own?.availability_days ?? [])
        }
        profileHydrated.current = true
      } else {
        errors.push('Votre profil est indisponible. Son enregistrement est suspendu.')
      }
      if (matchResult.status === 'fulfilled') {
        setMatches(matchResult.value.matches)
        setTruncated(matchResult.value.truncated)
        setMatchesReady(true)
      } else {
        errors.push('Les correspondances sont indisponibles.')
      }
      if (missionResult.status === 'fulfilled') {
        setMissions(missionResult.value)
        setMissionsReady(true)
      }
      else errors.push('Les résolutions collectives sont indisponibles.')
      if (contactResult.status === 'fulfilled') {
        setContactsReady(true)
        setContactsReceived(contactResult.value.received)
        setContactsSent(contactResult.value.sent)
      } else {
        errors.push('Les demandes de contact sont indisponibles.')
      }
      setLoadErrors(errors)
      setLoaded(true)
    } catch (error) {
      if (isEntraideCancellation(error) && currentLoad.current === operation && requestSession.current === scope) {
        setSessionMismatch(true)
        setLoading(false)
      } else if (!isEntraideCancellation(error) && operation.active() && currentLoad.current === operation) {
        setLoadErrors([error instanceof EntraideTimeoutError
          ? error.message : 'Le chargement Entraide a échoué. Réessayez.'])
        setLoaded(true)
      }
    } finally {
      if (operation.active() && currentLoad.current === operation) setLoading(false)
      operation.finish()
    }
  }, [userId])

  useEffect(() => {
    const scope = createEntraideSession(
      supabase, { user: { id: userId }, access_token: accessToken },
      restored => {
        if (restored) setAuthEpoch(epoch => epoch + 1)
        else setSessionMismatch(true)
      }
    )
    requestSession.current = scope
    // A refreshed token starts a new request epoch without remounting this user's drafts.
    void loadData(scope)
    return () => {
      scope.dispose()
      if (requestSession.current === scope) requestSession.current = null
    }
  }, [supabase, userId, accessToken, authEpoch, loadData])

  async function mutate<T>(
    route: 'profile' | 'missions' | 'contacts', schema: z.ZodType<T>, body: unknown,
    success: string, after?: (value: T) => void
  ) {
    const scope = requestSession.current
    if (!scope || currentMutation.current) return
    const operation = scope.start()
    currentMutation.current = operation
    setBusy(true)
    try {
      const result = await operation.request(route, schema, body)
      await operation.assertCurrent()
      if (requestSession.current !== scope) return
      after?.(result)
      toast.success(success)
      await loadData(scope)
    } catch (error) {
      if (!isEntraideCancellation(error) && operation.active() && requestSession.current === scope) {
        let failure = error
        if (!(failure instanceof EntraideTimeoutError)) {
          try { await operation.assertCurrent() }
          catch (identityError) { failure = identityError }
        }
        if (operation.active() && requestSession.current === scope && !isEntraideCancellation(failure)) {
          const message = failure instanceof Error ? failure.message : 'Action Entraide impossible.'
          if (failure instanceof EntraideTimeoutError) setLoadErrors([message])
          toast.error(message)
        }
      }
    } finally {
      operation.finish()
      if (currentMutation.current === operation) {
        currentMutation.current = null
        setBusy(false)
      }
    }
  }

  function saveProfile() {
    if (!profileReady) return
    return mutate('profile', OwnProfileResponseSchema, {
      skills_offered: skillsOffered.split(',').map(skill => skill.trim()).filter(Boolean),
      skills_needed: skillsNeeded.split(',').map(skill => skill.trim()).filter(Boolean),
      availability_days: availabilityDays,
    }, 'Profil enregistré', result => {
      if (!result.profile || result.profile.user_id !== userId) throw new Error('Réponse Entraide invalide.')
      setProfile(result.profile)
    })
  }

  function createMission() {
    if (!newMissionTitle.trim()) { toast.error('Titre requis'); return }
    const revision = missionRevision.current
    return mutate('missions', MissionCreatedSchema, {
      title: newMissionTitle, description: newMissionDesc,
      min_participants: newMissionMin, max_participants: null,
    }, 'Résolution créée', () => {
      if (missionRevision.current === revision) {
        setNewMissionTitle('')
        setNewMissionDesc('')
        setNewMissionMin(2)
      }
    })
  }

  function missionAction(missionId: string, action: 'join' | 'leave' | 'start' | 'complete' | 'cancel', message: string) {
    return mutate('missions', MissionUpdatedSchema, { mission_id: missionId, action }, message)
  }
  function joinMission(id: string) { return missionAction(id, 'join', 'Résolution rejointe') }
  function leaveMission(id: string) { return missionAction(id, 'leave', 'Résolution quittée') }
  function startMission(id: string) { return missionAction(id, 'start', 'Résolution démarrée') }
  function completeMission(id: string) { return missionAction(id, 'complete', 'Résolution terminée') }
  function cancelMission(id: string) { return missionAction(id, 'cancel', 'Résolution annulée') }
  function sendContactRequest(recipientId: string) {
    return mutate('contacts', ContactCreatedSchema,
      { recipient_id: recipientId, message: null }, 'Demande de contact envoyée')
  }
  function respondToContact(requestId: string, response: 'accept' | 'decline' | 'block') {
    return mutate('contacts', ContactUpdatedSchema, { request_id: requestId, response },
      response === 'accept' ? 'Contact accepté' : response === 'block' ? 'Profil bloqué' : 'Contact refusé')
  }

  if (sessionMismatch) {
    return (
      <div role="alert" className="p-8">
        <p>Votre session a changé. Actualisez la session pour continuer.</p>
        <Button onClick={() => globalThis.location.reload()}>Actualiser la session</Button>
      </div>
    )
  }

  if (loading && !loaded) {
    return (
      <div role="status" aria-label="Chargement Entraide" className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Réseau d&apos;Experts Entraide</h1>
      <p className="text-muted mb-6">
        Collaborez avec d&apos;autres experts AKASHA sur des résolutions collectives
      </p>

      {loading && <p role="status" className="text-sm text-muted mb-4">Actualisation en cours…</p>}
      {loadErrors.length > 0 && (
        <div role="alert" className="mb-4">
          {loadErrors.map(message => <p key={message}>{message}</p>)}
          <Button variant="ghost" onClick={() => void loadData()} disabled={loading}>Actualiser les données</Button>
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'profil', label: 'Mon Profil', icon: <Users className="w-4 h-4" /> },
          { id: 'missions', label: 'Résolutions Collectives', icon: <Target className="w-4 h-4" /> },
          { id: 'contacts', label: 'Contacts', icon: <MessageCircle className="w-4 h-4" /> },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      <div className="mt-6">
        {activeTab === 'profil' && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Compétences & Disponibilités</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="entraide-offered" className="block text-sm font-medium mb-2">Compétences offertes (séparées par virgule)</label>
                <Input
                  id="entraide-offered"
                  value={skillsOffered}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { profileRevision.current += 1; setSkillsOffered(e.target.value) }}
                  placeholder="ex: développement, design, stratégie"
                />
              </div>
              <div>
                <label htmlFor="entraide-needed" className="block text-sm font-medium mb-2">Compétences recherchées</label>
                <Input
                  id="entraide-needed"
                  value={skillsNeeded}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { profileRevision.current += 1; setSkillsNeeded(e.target.value) }}
                  placeholder="ex: marketing, finance, juridique"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Jours de disponibilité</label>
                <div className="flex flex-wrap gap-2">
                  {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => (
                    <Button
                      key={day}
                      size="sm"
                      aria-pressed={availabilityDays.includes(day)}
                      variant={availabilityDays.includes(day) ? 'primary' : 'ghost'}
                      onClick={() => {
                        profileRevision.current += 1
                        setAvailabilityDays((prev) =>
                          prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                        )
                      }}
                    >
                      {{
                        mon: 'Lun',
                        tue: 'Mar',
                        wed: 'Mer',
                        thu: 'Jeu',
                        fri: 'Ven',
                        sat: 'Sam',
                        sun: 'Dim',
                      }[day]}
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={saveProfile} disabled={busy || !profileReady}>Enregistrer mon profil</Button>
            </div>

            {profile && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-3">Experts compatibles ({matches.length})</h3>
                {truncated && (
                  <p role="status" className="text-sm text-muted mb-3">
                    Recherche limitée à 500 profils. D’autres correspondances peuvent exister.
                  </p>
                )}
                {!matchesReady ? (
                  <p role="status">{loading ? 'Recherche des correspondances…' : 'Correspondances indisponibles. Réessayez le chargement.'}</p>
                ) : matches.length === 0 ? (
                  <EmptyState
                    icon={<Users />}
                    title="Aucune correspondance"
                    description="Aucun expert compatible parmi les profils examinés."
                  />
                ) : (
                  <div className="space-y-3">
                    {matches.slice(0, 5).map((match) => (
                      <Card key={match.userId} className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Expert {match.userId.slice(0, 8)}</p>
                            <p className="text-sm text-muted">Score: {match.score}/100</p>
                            <p className="text-xs text-muted mt-1">
                              {match.reasons.map((r) => r.replace('_', ' ')).join(', ')}
                            </p>
                          </div>
                          <Button size="sm" disabled={busy} onClick={() => sendContactRequest(match.userId)}>
                            Contacter
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'missions' && (
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Créer une résolution collective</h2>
              <div className="space-y-4">
                <Input
                  placeholder="Titre de la résolution"
                  value={newMissionTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { missionRevision.current += 1; setNewMissionTitle(e.target.value) }}
                />
                <Input
                  placeholder="Description"
                  value={newMissionDesc}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { missionRevision.current += 1; setNewMissionDesc(e.target.value) }}
                />
                <div className="flex items-center gap-4">
                  <label htmlFor="entraide-min" className="text-sm font-medium">Participants minimum:</label>
                  <Input
                    id="entraide-min"
                    type="number"
                    min={2}
                    max={100}
                    value={newMissionMin}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { missionRevision.current += 1; setNewMissionMin(Number(e.target.value)) }}
                    className="w-20"
                  />
                </div>
                <Button onClick={createMission} disabled={busy}>
                  <Plus className="w-4 h-4 mr-2" />
                  Créer
                </Button>
              </div>
            </Card>

            <div>
              <h2 className="text-xl font-semibold mb-4">Résolutions ouvertes ({missions.length})</h2>
              {!missionsReady ? (
                <p role="status">{loading ? 'Chargement des résolutions…' : 'Résolutions indisponibles. Réessayez le chargement.'}</p>
              ) : missions.length === 0 ? (
                <EmptyState
                  icon={<Target />}
                  title="Aucune résolution collective"
                  description="Créez-en une pour collaborer avec d'autres experts"
                />
              ) : (
                <div className="space-y-4">
                  {missions.map((mission) => {
                    const participants = mission.missions_collectives_participants || []
                    const isParticipant = participants.some((p) => p.user_id === userId)
                    const isOrganizer = mission.organizer_id === userId

                    return (
                      <Card key={mission.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">{mission.title}</h3>
                            <p className="text-sm text-muted mt-1">{mission.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                              <span>
                                {participants.length}/{mission.min_participants} participants
                              </span>
                              <span className="capitalize">{mission.status}</span>
                              {isOrganizer && <span className="text-primary">(Organisateur)</span>}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            {isOrganizer ? (
                              <>
                                {mission.status === 'prete' && (
                                  <Button size="sm" disabled={busy} onClick={() => startMission(mission.id)}>
                                    Démarrer
                                  </Button>
                                )}
                                {mission.status === 'en_cours' && (
                                  <Button size="sm" disabled={busy} onClick={() => completeMission(mission.id)}>
                                    Terminer
                                  </Button>
                                )}
                                {mission.status !== 'terminee' && mission.status !== 'annulee' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => cancelMission(mission.id)}
                                  >
                                    Annuler
                                  </Button>
                                )}
                              </>
                            ) : isParticipant ? (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => leaveMission(mission.id)}>
                                Quitter
                              </Button>
                            ) : mission.status === 'ouverte' || mission.status === 'prete' ? (
                              <Button size="sm" disabled={busy} onClick={() => joinMission(mission.id)}>
                                Rejoindre
                              </Button>
                            ) : (
                              <span className="text-sm text-muted">
                                {mission.status === 'terminee' ? 'Terminée' : 'Fermée'}
                              </span>
                            )}
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Demandes reçues ({contactsReceived.length})</h2>
              {!contactsReady ? (
                <p role="status">{loading ? 'Chargement des demandes…' : 'Demandes indisponibles. Réessayez le chargement.'}</p>
              ) : contactsReceived.length === 0 ? (
                <EmptyState
                  icon={<MessageCircle />}
                  title="Aucune demande"
                  description="Vous n'avez reçu aucune demande de contact pour le moment"
                />
              ) : (
                <div className="space-y-3">
                  {contactsReceived.map((req) => (
                    <Card key={req.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Expert {req.requester_id.slice(0, 8)}</p>
                          <p className="text-sm text-muted">{req.message || 'Aucun message'}</p>
                          <p className="text-xs text-muted mt-1 capitalize">{req.status}</p>
                        </div>
                        {req.status === 'pending' && (
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <Button size="sm" disabled={busy} onClick={() => respondToContact(req.id, 'accept')}>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Accepter
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                    onClick={() => respondToContact(req.id, 'decline')}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Refuser
                              </Button>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                                    onClick={() => respondToContact(req.id, 'block')}
                              className="text-red-500 hover:text-red-600"
                            >
                              Bloquer
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Demandes envoyées ({contactsSent.length})</h2>
              {!contactsReady ? (
                <p role="status">{loading ? 'Chargement des demandes…' : 'Demandes indisponibles. Réessayez le chargement.'}</p>
              ) : contactsSent.length === 0 ? (
                <EmptyState
                  icon={<MessageCircle />}
                  title="Aucune demande envoyée"
                  description="Commencez par trouver des experts compatibles dans l'onglet Profil"
                />
              ) : (
                <div className="space-y-3">
                  {contactsSent.map((req) => (
                    <Card key={req.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Expert {req.recipient_id.slice(0, 8)}</p>
                          <p className="text-sm text-muted">{req.message || 'Aucun message'}</p>
                          <p className="text-xs text-muted mt-1 capitalize">{req.status}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
