/**
 * /ost → /music/starfall, permanently. STARFALL's page lived at /ost until the music section got
 * its own rack (4 Oct 2026); links and any keychain QR printed before that keep working, and the
 * query comes along (?scan=1 lands on the playlist, ?t= on a moment).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const ALL: APIRoute = ({ url, redirect }) => redirect(`/music/starfall${url.search}`, 301);
