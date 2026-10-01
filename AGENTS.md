<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep dates of birth, gender, and phone in owner-restricted `profile_safety`; public biographical text belongs in `profiles`, because private personal information must not leak through public profile reads.
- Archive posts by setting `archived_at` and filter public timelines; keep owner access for restoration, because archiving must not delete the original media or conversation.
