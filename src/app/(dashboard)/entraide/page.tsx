'use client'

/* eslint-disable max-lines, react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { computeMatchScore } from '@purama/entraide'
import type { MutualAidProfile } from '@purama/entraide'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import Tabs from '@/components/ui/Tabs'
import EmptyState from '@/components/ui/EmptyState'
import { Loader2, Users, Target, MessageCircle, Plus, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Profile {
  user_id: string
  skills_offered: string[]
  skills_needed: string[]
  availability_days: string[]
  radius_km: number | null
  location_lat: number | null
  location_lng: number | null
}

interface Mission {
  id: string
  title: string
  description: string
  status: string
  min_participants: number
  max_participants: number | null
  organizer_id: string
  created_at: string
  missions_collectives_participants: { user_id: string }[]
}

interface ContactRequest {
  id: string
  requester_id: string
  recipient_id: string
  status: string
  message: string | null
  created_at: string
}

export default function EntraidePage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState('profil')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  // Profil state
  const [profile, setProfile] = useState<Profile | null>(null)
  const [skillsOffered, setSkillsOffered] = useState('')
  const [skillsNeeded, setSkillsNeeded] = useState('')
  const [availabilityDays, setAvailabilityDays] = useState<string[]>([])

  // Matches state
  const [matches, setMatches] = useState<Array<{ profile: Profile; score: number; reasons: string[] }>>([])

  // Missions state
  const [missions, setMissions] = useState<Mission[]>([])
  const [newMissionTitle, setNewMissionTitle] = useState('')
  const [newMissionDesc, setNewMissionDesc] = useState('')
  const [newMissionMin, setNewMissionMin] = useState(2)

  // Contacts state
  const [contactsReceived, setContactsReceived] = useState<ContactRequest[]>([])
  const [contactsSent, setContactsSent] = useState<ContactRequest[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)

      // Load profile
      const { data: profileData } = await supabase
        .from('entraide_profils')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (profileData) {
        setProfile(profileData)
        setSkillsOffered((profileData.skills_offered || []).join(', '))
        setSkillsNeeded((profileData.skills_needed || []).join(', '))
        setAvailabilityDays(profileData.availability_days || [])

        // Load matches
        await loadMatches(user.id, profileData)
      }

      // Load missions
      const { data: missionsData } = await supabase
        .from('missions_collectives')
        .select('*, missions_collectives_participants(user_id)')
        .order('created_at', { ascending: false })

      setMissions(missionsData || [])

      // Load contacts
      const { data: received } = await supabase
        .from('entraide_contact_requests')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })

      const { data: sent } = await supabase
        .from('entraide_contact_requests')
        .select('*')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false })

      setContactsReceived(received || [])
      setContactsSent(sent || [])
    } catch (error) {
      console.error('[entraide load]', error)
      toast.error('Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  async function loadMatches(currentUserId: string, currentProfile: Profile) {
    try {
      // Get all profiles + their blocked lists
      const { data: allProfiles } = await supabase.from('entraide_profils').select('*')

      if (!allProfiles) return

      const { data: currentBlocked } = await supabase
        .from('entraide_blocages')
        .select('blocked_id')
        .eq('blocker_id', currentUserId)

      const currentBlockedIds = new Set((currentBlocked || []).map((b) => b.blocked_id))

      const scored = await Promise.all(
        allProfiles
          .filter((p) => p.user_id !== currentUserId)
          .map(async (candidateProfile) => {
            const { data: candidateBlocked } = await supabase
              .from('entraide_blocages')
              .select('blocked_id')
              .eq('blocker_id', candidateProfile.user_id)

            const candidateBlockedIds = (candidateBlocked || []).map((b) => b.blocked_id)

            const myProfile: MutualAidProfile = {
              userId: currentUserId,
              skillsOffered: currentProfile.skills_offered || [],
              skillsNeeded: currentProfile.skills_needed || [],
              availabilityDays: (currentProfile.availability_days || []) as Array<
                'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
              >,
              radiusKm: currentProfile.radius_km,
              location:
                currentProfile.location_lat !== null && currentProfile.location_lng !== null
                  ? { lat: currentProfile.location_lat, lng: currentProfile.location_lng }
                  : null,
              blockedUserIds: Array.from(currentBlockedIds),
            }

            const candidateMutual: MutualAidProfile = {
              userId: candidateProfile.user_id,
              skillsOffered: candidateProfile.skills_offered || [],
              skillsNeeded: candidateProfile.skills_needed || [],
              availabilityDays: (candidateProfile.availability_days || []) as Array<
                'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
              >,
              radiusKm: candidateProfile.radius_km,
              location:
                candidateProfile.location_lat !== null && candidateProfile.location_lng !== null
                  ? { lat: candidateProfile.location_lat, lng: candidateProfile.location_lng }
                  : null,
              blockedUserIds: candidateBlockedIds,
            }

            const { score, reasons } = computeMatchScore(myProfile, candidateMutual)

            return { profile: candidateProfile, score, reasons }
          })
      )

      setMatches(scored.filter((m) => m.score > 0).sort((a, b) => b.score - a.score))
    } catch (error) {
      console.error('[loadMatches]', error)
    }
  }

  async function saveProfile() {
    try {
      const res = await fetch('/api/entraide/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills_offered: skillsOffered.split(',').map((s) => s.trim()).filter(Boolean),
          skills_needed: skillsNeeded.split(',').map((s) => s.trim()).filter(Boolean),
          availability_days: availabilityDays,
        }),
      })

      if (!res.ok) throw new Error('Échec sauvegarde profil')

      toast.success('Profil enregistré')
      await loadData()
    } catch (error) {
      console.error('[saveProfile]', error)
      toast.error('Erreur lors de la sauvegarde')
    }
  }

  async function createMission() {
    if (!newMissionTitle.trim()) {
      toast.error('Titre requis')
      return
    }

    try {
      const res = await fetch('/api/entraide/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newMissionTitle,
          description: newMissionDesc,
          min_participants: newMissionMin,
          max_participants: null,
        }),
      })

      if (!res.ok) throw new Error('Échec création mission')

      toast.success('Résolution collective créée')
      setNewMissionTitle('')
      setNewMissionDesc('')
      setNewMissionMin(2)
      await loadData()
    } catch (error) {
      console.error('[createMission]', error)
      toast.error('Erreur lors de la création')
    }
  }

  async function joinMission(missionId: string) {
    try {
      const res = await fetch('/api/entraide/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: missionId, action: 'join' }),
      })

      if (!res.ok) throw new Error('Échec rejoindre mission')

      toast.success('Vous avez rejoint le collectif')
      await loadData()
    } catch (error) {
      console.error('[joinMission]', error)
      toast.error('Impossible de rejoindre')
    }
  }

  async function leaveMission(missionId: string) {
    try {
      const res = await fetch('/api/entraide/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: missionId, action: 'leave' }),
      })

      if (!res.ok) throw new Error('Échec quitter mission')

      toast.success('Vous avez quitté le collectif')
      await loadData()
    } catch (error) {
      console.error('[leaveMission]', error)
      toast.error('Impossible de quitter')
    }
  }

  async function startMission(missionId: string) {
    try {
      const res = await fetch('/api/entraide/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: missionId, action: 'start' }),
      })

      if (!res.ok) throw new Error('Échec démarrage mission')

      toast.success('Résolution démarrée')
      await loadData()
    } catch (error) {
      console.error('[startMission]', error)
      toast.error('Impossible de démarrer')
    }
  }

  async function completeMission(missionId: string) {
    try {
      const res = await fetch('/api/entraide/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: missionId, action: 'complete' }),
      })

      if (!res.ok) throw new Error('Échec terminer mission')

      toast.success('Résolution terminée')
      await loadData()
    } catch (error) {
      console.error('[completeMission]', error)
      toast.error('Impossible de terminer')
    }
  }

  async function cancelMission(missionId: string) {
    try {
      const res = await fetch('/api/entraide/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: missionId, action: 'cancel' }),
      })

      if (!res.ok) throw new Error('Échec annulation mission')

      toast.success('Résolution annulée')
      await loadData()
    } catch (error) {
      console.error('[cancelMission]', error)
      toast.error("Impossible d'annuler")
    }
  }

  async function sendContactRequest(recipientId: string) {
    try {
      const res = await fetch('/api/entraide/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: recipientId, message: null }),
      })

      if (!res.ok) throw new Error('Échec envoi demande')

      toast.success('Demande de contact envoyée')
      await loadData()
    } catch (error) {
      console.error('[sendContactRequest]', error)
      toast.error("Impossible d'envoyer la demande")
    }
  }

  async function respondToContact(requestId: string, response: 'accept' | 'decline' | 'block') {
    try {
      const res = await fetch('/api/entraide/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, response }),
      })

      if (!res.ok) throw new Error('Échec réponse')

      toast.success(
        response === 'accept'
          ? 'Contact accepté'
          : response === 'decline'
            ? 'Contact refusé'
            : 'Profil bloqué'
      )
      await loadData()
    } catch (error) {
      console.error('[respondToContact]', error)
      toast.error('Erreur lors de la réponse')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Réseau d'Experts Entraide</h1>
      <p className="text-muted mb-6">
        Collaborez avec d'autres experts AKASHA sur des résolutions collectives
      </p>

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
                <label className="block text-sm font-medium mb-2">Compétences offertes (séparées par virgule)</label>
                <Input
                  value={skillsOffered}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSkillsOffered(e.target.value)}
                  placeholder="ex: développement, design, stratégie"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Compétences recherchées</label>
                <Input
                  value={skillsNeeded}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSkillsNeeded(e.target.value)}
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
                      variant={availabilityDays.includes(day) ? 'primary' : 'ghost'}
                      onClick={() => {
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
              <Button onClick={saveProfile}>Enregistrer mon profil</Button>
            </div>

            {profile && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-3">Experts compatibles ({matches.length})</h3>
                {matches.length === 0 ? (
                  <EmptyState
                    icon={<Users />}
                    title="Aucune correspondance"
                    description="Complétez votre profil pour trouver des experts compatibles"
                  />
                ) : (
                  <div className="space-y-3">
                    {matches.slice(0, 5).map((match) => (
                      <Card key={match.profile.user_id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Expert {match.profile.user_id.slice(0, 8)}</p>
                            <p className="text-sm text-muted">Score: {match.score}/100</p>
                            <p className="text-xs text-muted mt-1">
                              {match.reasons.map((r) => r.replace('_', ' ')).join(', ')}
                            </p>
                          </div>
                          <Button size="sm" onClick={() => sendContactRequest(match.profile.user_id)}>
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMissionTitle(e.target.value)}
                />
                <Input
                  placeholder="Description"
                  value={newMissionDesc}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMissionDesc(e.target.value)}
                />
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium">Participants minimum:</label>
                  <Input
                    type="number"
                    min={2}
                    max={100}
                    value={newMissionMin}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMissionMin(Number(e.target.value))}
                    className="w-20"
                  />
                </div>
                <Button onClick={createMission}>
                  <Plus className="w-4 h-4 mr-2" />
                  Créer
                </Button>
              </div>
            </Card>

            <div>
              <h2 className="text-xl font-semibold mb-4">Résolutions ouvertes ({missions.length})</h2>
              {missions.length === 0 ? (
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
                                  <Button size="sm" onClick={() => startMission(mission.id)}>
                                    Démarrer
                                  </Button>
                                )}
                                {mission.status === 'en_cours' && (
                                  <Button size="sm" onClick={() => completeMission(mission.id)}>
                                    Terminer
                                  </Button>
                                )}
                                {mission.status !== 'terminee' && mission.status !== 'annulee' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => cancelMission(mission.id)}
                                  >
                                    Annuler
                                  </Button>
                                )}
                              </>
                            ) : isParticipant ? (
                              <Button size="sm" variant="ghost" onClick={() => leaveMission(mission.id)}>
                                Quitter
                              </Button>
                            ) : mission.status === 'ouverte' || mission.status === 'prete' ? (
                              <Button size="sm" onClick={() => joinMission(mission.id)}>
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
              {contactsReceived.length === 0 ? (
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
                              <Button size="sm" onClick={() => respondToContact(req.id, 'accept')}>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Accepter
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => respondToContact(req.id, 'decline')}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Refuser
                              </Button>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
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
              {contactsSent.length === 0 ? (
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
