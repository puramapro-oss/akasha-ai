import { z } from 'zod'

// Public HTTP contracts only. The matching engine and other users' coordinates stay on the server.
export const AvailabilityDaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
export const OwnProfileSchema = z.object({
  user_id: z.string().uuid(),
  skills_offered: z.array(z.string()),
  skills_needed: z.array(z.string()),
  availability_days: z.array(AvailabilityDaySchema),
  radius_km: z.number().int().positive().nullable(),
  location_lat: z.number().finite().min(-90).max(90).nullable(),
  location_lng: z.number().finite().min(-180).max(180).nullable(),
})
export type OwnProfile = z.infer<typeof OwnProfileSchema>

export const UpdateProfileSchema = OwnProfileSchema.omit({ user_id: true }).partial()
export const OwnProfileResponseSchema = z.object({ profile: OwnProfileSchema.nullable() }).strict()

export const MatchSchema = z.object({
  userId: z.string().uuid(),
  score: z.number().finite().min(0).max(100),
  reasons: z.array(z.string()),
}).strict()
export const MatchesResponseSchema = z.object({
  matches: z.array(MatchSchema),
  scanned_profiles: z.number().int().nonnegative(),
  truncated: z.boolean(),
}).strict()
export type MutualAidMatch = z.infer<typeof MatchSchema>

export const MissionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(['ouverte', 'prete', 'en_cours', 'terminee', 'annulee']),
  min_participants: z.number().int().positive(),
  max_participants: z.number().int().positive().nullable(),
  organizer_id: z.string().uuid(),
  created_at: z.string(),
  missions_collectives_participants: z.array(z.object({ user_id: z.string().uuid() })),
})
export type Mission = z.infer<typeof MissionSchema>
export const ContactRequestSchema = z.object({
  id: z.string().uuid(),
  requester_id: z.string().uuid(),
  recipient_id: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'declined', 'expired', 'blocked']),
  message: z.string().nullable(),
  created_at: z.string(),
})
export type ContactRequest = z.infer<typeof ContactRequestSchema>

export const MissionCreatedSchema = z.object({ mission_id: z.string().uuid() }).strict()
export const MissionUpdatedSchema = z.object({
  mission: z.object({
    id: z.string().uuid(),
    minParticipants: z.number().int().positive(),
    maxParticipants: z.number().int().positive().nullable(),
    participantIds: z.array(z.string().uuid()),
    status: MissionSchema.shape.status,
  }),
}).strict()
export const ContactCreatedSchema = z.object({ request_id: z.string().uuid() }).strict()
export const ContactUpdatedSchema = z.object({ status: ContactRequestSchema.shape.status }).strict()
