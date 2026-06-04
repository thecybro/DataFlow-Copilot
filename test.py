from pathlib import Path

import pandas as pd


data_dir = Path(__file__).parent / "sample_data"

# Source dataframes
accounts = pd.read_csv(data_dir / "accounts.csv")
vip_accounts = pd.read_csv(data_dir / "vip_accounts.csv")
tickets = pd.read_csv(data_dir / "tickets.csv")
ticket_backlog = pd.read_csv(data_dir / "ticket_backlog.csv")
regions = pd.read_csv(data_dir / "regions.csv")
satisfaction = pd.read_json(data_dir / "satisfaction.json")
manual_targets = pd.DataFrame(
    [
        {"region": "west", "target_response_hours": 8},
        {"region": "east", "target_response_hours": 6},
    ]
)

# Combine related extracts
all_accounts = pd.concat([accounts, vip_accounts], ignore_index=True)
all_tickets = pd.concat([tickets, ticket_backlog], ignore_index=True)

# Clean and normalize account data
all_accounts = all_accounts.fillna(
    {
        "email": "missing@example.com",
        "segment": "standard",
        "region": "unknown",
    }
)
all_accounts = all_accounts.rename(
    columns={
        "id": "account_id",
        "team": "account_team",
        "created": "account_created_at",
    }
)
all_accounts = all_accounts.drop(columns=["internal_notes"])
all_accounts = all_accounts.dropna()

# Clean and normalize ticket data
all_tickets = all_tickets.fillna(
    {
        "status": "open",
        "priority": "medium",
        "source": "unknown",
        "assigned_team": "triage",
    }
)
all_tickets = all_tickets.rename(
    columns={
        "customer_id": "account_id",
        "source": "ticket_source",
        "created": "ticket_created_at",
    }
)
all_tickets = all_tickets.drop(columns=["raw_payload"])
all_tickets = all_tickets.dropna()

# Enrich tickets with account, region, target, and feedback context
ticket_account_view = pd.merge(
    all_tickets,
    all_accounts,
    on="account_id",
    how="left",
)
ticket_region_view = ticket_account_view.merge(
    regions,
    on="region",
    how="left",
)
ticket_target_view = pd.merge(
    ticket_region_view,
    manual_targets,
    on="region",
    how="left",
)
ticket_feedback_view = ticket_target_view.merge(
    satisfaction,
    on="ticket_id",
    how="left",
)

# Reassignment chains should create a readable lineage, not self-loops
ticket_feedback_view = ticket_feedback_view.fillna(
    {
        "satisfaction_score": 0,
        "target_response_hours": 24,
        "market": "unknown",
    }
)
ticket_feedback_view = ticket_feedback_view.rename(
    columns={
        "satisfaction_score": "csat",
        "target_response_hours": "target_hours",
    }
)
ticket_feedback_view = ticket_feedback_view.drop(columns=["debug_flags"])
ticket_feedback_view = ticket_feedback_view.dropna()

# Multiple summaries from the same enriched dataframe
team_summary = ticket_feedback_view.groupby("account_team", as_index=False).count()
priority_summary = ticket_feedback_view.groupby("priority", as_index=False).sum()
region_summary = ticket_feedback_view.groupby("region", as_index=False).count()
source_summary = ticket_feedback_view.groupby("ticket_source", as_index=False).count()
market_summary = ticket_feedback_view.groupby("market", as_index=False).sum()

# Downstream combinations of summaries
team_priority_view = pd.merge(
    team_summary,
    priority_summary,
    left_on="account_team",
    right_on="priority",
    how="outer",
)
regional_market_view = region_summary.merge(
    market_summary,
    left_on="region",
    right_on="market",
    how="outer",
)
executive_dashboard = pd.concat(
    [team_priority_view, regional_market_view, source_summary],
    ignore_index=True,
)
executive_dashboard = executive_dashboard.fillna(0)
executive_dashboard = executive_dashboard.rename(
    columns={
        "account_team": "dimension",
        "ticket_id": "ticket_count",
    }
)
executive_dashboard = executive_dashboard.drop(columns=["priority"])
executive_dashboard = executive_dashboard.dropna()
