/**
 * /ost → /music?cd=starfall, permanently, in one hop. STARFALL's page lived at /ost until the music
 * section got its own address (4 Oct 2026), then at /music/starfall until every song moved into
 * the crate (14 Oct 2026); links and any keychain QR printed before that land on its CD.
 */
import type { APIRoute } from 'astro';
import { cdPath } from '../data/music';

export const prerender = false;

export const ALL: APIRoute = ({ redirect }) => redirect(cdPath('starfall'), 301);
