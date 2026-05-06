"""Repository-root conftest — runs BEFORE backend/tests/conftest.py.

Pytest reads conftest.py files top-down from rootdir. By placing this
file at the project root we guarantee it executes before any
`from backend.database import engine` import in subdir conftests.

Job: redirect the test suite to a SEPARATE Postgres database via
TEST_DATABASE_URL. Without this, pytest would TRUNCATE every table
in whatever DATABASE_URL points at — typically the live Railway
production DB.

Modes:
  • TEST_DATABASE_URL set → DATABASE_URL is rewritten to it for the
    rest of the process. Tests are isolated.
  • TEST_DATABASE_URL unset AND DATABASE_URL looks like a hosted
    Postgres → pytest refuses to start. Error message tells the user
    exactly how to fix.
  • TEST_DATABASE_URL unset AND DATABASE_URL is missing or local
    (containing 'localhost'/'127.0.0.1') → allow, with a warning.

Override:
  • MARATHON_ALLOW_PROD_DB_TESTS=1 disables the safety check. Only
    use this if you genuinely want tests to run against the
    DATABASE_URL value (e.g. one-off CI on an ephemeral DB you just
    provisioned). NEVER set in shell profile.
"""

import os
import sys

# Load .env BEFORE the safety check — otherwise DATABASE_URL is still
# unset at this point and we'd skip the refusal even when the .env
# points at production. Mirrors what backend/database.py does on import.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed → assume env is already set externally


def _looks_local(url: str) -> bool:
    return any(s in url for s in ("localhost", "127.0.0.1", "::1"))


def _refuse(msg: str) -> None:
    print(f"\n[pytest] {msg}\n", file=sys.stderr)
    sys.exit(1)


def _setup_test_database_url() -> None:
    test_url = os.getenv("TEST_DATABASE_URL")
    if test_url:
        # Belt + braces: never let a TEST_DATABASE_URL secretly point at
        # the same database the app uses.
        prod_url = os.getenv("DATABASE_URL")
        if prod_url and prod_url == test_url:
            _refuse(
                "TEST_DATABASE_URL is identical to DATABASE_URL — that defeats "
                "isolation. Point TEST_DATABASE_URL at a separate database."
            )
        os.environ["DATABASE_URL"] = test_url
        return

    if os.getenv("MARATHON_ALLOW_PROD_DB_TESTS") == "1":
        return

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        return                 # backend/database.py will raise its own clear error
    if _looks_local(db_url):
        return                 # localhost dev DB — fine to run tests against

    _refuse(
        "REFUSING TO RUN TESTS — DATABASE_URL points at a hosted Postgres "
        "and TEST_DATABASE_URL is not set. The pytest suite TRUNCATEs every "
        "Marathon table before each test; running it would wipe production "
        "data.\n\n"
        "Fix:\n"
        "  • Provision a separate Postgres (Railway free tier works) and\n"
        "    export TEST_DATABASE_URL=postgresql://… before running pytest.\n"
        "  • Or set MARATHON_ALLOW_PROD_DB_TESTS=1 to override (DANGEROUS;\n"
        "    only when you genuinely want to run against DATABASE_URL).\n"
    )


_setup_test_database_url()
