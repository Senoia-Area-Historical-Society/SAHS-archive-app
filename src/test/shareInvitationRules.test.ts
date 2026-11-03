import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain CommonJS, deliberately untyped and import-free so this
// test does not drag firebase-functions into the site build. See the module header.
import * as rules from '../../functions/shareInvitationRules.js';

const { escapeHtml, newCollaborators, buildInvitationEmail, resendRequest } = rules;

const folder = (sharedWith: unknown, ownerEmail = 'owner@example.com') => ({ ownerEmail, sharedWith });

describe('newCollaborators', () => {
    it('returns only the addresses added by this write', () => {
        expect(newCollaborators(folder(['a@example.com']), folder(['a@example.com', 'b@example.com']))).toEqual(['b@example.com']);
    });

    it('compares addresses case-insensitively and drops duplicates', () => {
        expect(newCollaborators(folder(['A@Example.com']), folder(['a@example.com', 'C@example.com', 'c@example.com']))).toEqual(['c@example.com']);
    });

    it('never invites the owner', () => {
        expect(newCollaborators(folder([]), folder(['Owner@example.com']))).toEqual([]);
    });

    it('invites nobody when someone is removed or nothing changes', () => {
        expect(newCollaborators(folder(['a@example.com', 'b@example.com']), folder(['a@example.com']))).toEqual([]);
        expect(newCollaborators(folder(['a@example.com']), folder(['a@example.com']))).toEqual([]);
    });

    it('invites nobody on create or delete, or when sharedWith is missing or malformed', () => {
        expect(newCollaborators(null, folder(['a@example.com']))).toEqual([]);
        expect(newCollaborators(folder(['a@example.com']), null)).toEqual([]);
        expect(newCollaborators(folder(undefined), folder('a@example.com'))).toEqual([]);
        expect(newCollaborators(folder(undefined), folder([42, '', 'a@example.com']))).toEqual(['a@example.com']);
    });
});

describe('buildInvitationEmail', () => {
    const base = {
        to: 'friend@example.com',
        fromAddress: 'archives@updates.example.org',
        museumName: 'Example Museum',
        siteUrl: 'https://archive.example.org/',
        folderName: 'Mill History',
        folderDescription: 'Photos of the cotton mill',
        sharerName: 'Mary Member',
        sharerEmail: 'mary@example.com',
    };

    it('comes from the museum, replies to the sharer and links to its own workspace', () => {
        const email = buildInvitationEmail(base);
        expect(email.from).toBe('Example Museum <archives@updates.example.org>');
        expect(email.to).toEqual(['friend@example.com']);
        expect(email.reply_to).toBe('mary@example.com');
        expect(email.subject).toBe('Mary Member (mary@example.com) shared a research folder with you');
        expect(email.html).toContain('href="https://archive.example.org/my-research"');
        expect(email.text).toContain('https://archive.example.org/my-research');
        expect(email.html).toContain('Photos of the cotton mill');
        expect(email.html).not.toMatch(/senoia/i);
    });

    it('escapes the folder name, description and sharer name in the HTML', () => {
        const email = buildInvitationEmail({
            ...base,
            folderName: 'Family <b>Tree</b>',
            folderDescription: '<a href="https://evil.example">click</a>',
            sharerName: '<img src=x onerror=alert(1)>',
        });
        expect(email.html).toContain('Family &lt;b&gt;Tree&lt;/b&gt;');
        expect(email.html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
        expect(email.html).not.toContain('<img src=x');
        expect(email.html).not.toContain('<b>Tree</b>');
    });

    it('keeps markup characters out of the From header', () => {
        expect(buildInvitationEmail({ ...base, museumName: 'Odd <Name> "Museum"' }).from)
            .toBe('Odd Name Museum <archives@updates.example.org>');
    });

    it('falls back sensibly with no museum name, folder name, description or sharer name', () => {
        const email = buildInvitationEmail({ ...base, museumName: '', folderName: '', folderDescription: '', sharerName: '' });
        expect(email.subject).toBe('mary@example.com shared a research folder with you');
        expect(email.html).toContain('Untitled folder');
        expect(email.from).toBe('the archive <archives@updates.example.org>');
        expect(email.html).not.toContain('font-style: italic');
    });
});

describe('resendRequest', () => {
    it('posts the email to Resend with the key and an idempotency key', () => {
        const { url, init } = resendRequest({ to: ['a@example.com'] }, 'key_123', 'share-f1-a@example.com');
        expect(url).toBe('https://api.resend.com/emails');
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer key_123');
        expect(init.headers['Idempotency-Key']).toBe('share-f1-a@example.com');
        expect(JSON.parse(init.body)).toEqual({ to: ['a@example.com'] });
    });
});

describe('escapeHtml', () => {
    it('escapes all five HTML metacharacters and tolerates null', () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
        expect(escapeHtml(null)).toBe('');
    });
});
