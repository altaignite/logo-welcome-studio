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

- Keep signup as a dedicated TanStack leaf route with browser-only state; this project deliberately has no account, submission or payment backend.
- Keep subscription rules and input validation in the shared signup module with concrete tests, so review and agreement screens use consistent terms.
- Use libphonenumber-js metadata for countries and dial codes; optional browser IP preselection must not overwrite manual choices or block signup.
- Treat displayed signature codes as local confirmation only, generated with Web Crypto and never reused within the current application, not as identity verification.
