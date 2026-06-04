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
subscriptions = pd.read_csv(data_dir / "subscriptions.csv")
invoices = pd.read_csv(data_dir / "invoices.csv")
payments = pd.read_csv(data_dir / "payments.csv")
refunds = pd.read_csv(data_dir / "refunds.csv")
products = pd.read_csv(data_dir / "products.csv")
usage_events = pd.read_json(data_dir / "usage_events.json")
feature_flags = pd.read_csv(data_dir / "feature_flags.csv")
experiment_assignments = pd.read_csv(data_dir / "experiment_assignments.csv")
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

# Product, billing, and usage branches
subscriptions = subscriptions.fillna(
    {
        "plan": "starter",
        "billing_period": "monthly",
        "status": "trialing",
        "mrr": 0,
    }
)
subscriptions = subscriptions.rename(
    columns={
        "customer_id": "account_id",
        "subscription_state": "subscription_status",
    }
)
subscriptions = subscriptions.drop(columns=["raw_contract"])
subscriptions = subscriptions.dropna()

invoices = invoices.fillna(
    {
        "amount_due": 0,
        "amount_paid": 0,
        "currency": "USD",
        "collection_status": "unknown",
    }
)
invoices = invoices.rename(
    columns={
        "customer_id": "account_id",
        "created": "invoice_created_at",
    }
)
invoices = invoices.drop(columns=["pdf_blob"])
invoices = invoices.dropna()

payments = payments.fillna(
    {
        "payment_status": "pending",
        "processor": "manual",
        "amount": 0,
    }
)
payments = payments.rename(
    columns={
        "customer_id": "account_id",
        "created": "payment_created_at",
    }
)
payments = payments.drop(columns=["processor_payload"])
payments = payments.dropna()

refunds = refunds.fillna(
    {
        "refund_reason": "unknown",
        "amount": 0,
    }
)
refunds = refunds.rename(
    columns={
        "customer_id": "account_id",
        "amount": "refund_amount",
    }
)
refunds = refunds.drop(columns=["audit_blob"])
refunds = refunds.dropna()

products = products.fillna(
    {
        "product_family": "core",
        "sku_status": "active",
    }
)
products = products.rename(
    columns={
        "id": "product_id",
        "name": "product_name",
    }
)
products = products.drop(columns=["internal_margin_notes"])
products = products.dropna()

usage_events = usage_events.fillna(
    {
        "event_name": "unknown",
        "event_count": 0,
        "workspace_id": "unknown",
    }
)
usage_events = usage_events.rename(
    columns={
        "customer_id": "account_id",
        "created": "usage_created_at",
    }
)
usage_events = usage_events.drop(columns=["event_payload"])
usage_events = usage_events.dropna()

feature_flags = feature_flags.fillna(
    {
        "flag_state": "off",
        "rollout_group": "control",
    }
)
feature_flags = feature_flags.rename(
    columns={
        "customer_id": "account_id",
        "flag": "feature_flag",
    }
)
feature_flags = feature_flags.drop(columns=["flag_metadata"])
feature_flags = feature_flags.dropna()

experiment_assignments = experiment_assignments.fillna(
    {
        "experiment_name": "unassigned",
        "variant": "control",
    }
)
experiment_assignments = experiment_assignments.rename(
    columns={
        "customer_id": "account_id",
        "assigned": "experiment_assigned_at",
    }
)
experiment_assignments = experiment_assignments.drop(columns=["assignment_context"])
experiment_assignments = experiment_assignments.dropna()

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

# Subscription and billing enrichment
account_subscription_view = all_accounts.merge(
    subscriptions,
    on="account_id",
    how="left",
)
account_product_view = pd.merge(
    account_subscription_view,
    products,
    on="product_id",
    how="left",
)
account_invoice_view = account_product_view.merge(
    invoices,
    on="account_id",
    how="left",
)
account_payment_view = pd.merge(
    account_invoice_view,
    payments,
    on="account_id",
    how="left",
)
account_revenue_view = account_payment_view.merge(
    refunds,
    on="account_id",
    how="left",
)
account_revenue_view = account_revenue_view.fillna(
    {
        "refund_amount": 0,
        "amount_paid": 0,
        "payment_status": "missing",
        "product_family": "unknown",
    }
)
account_revenue_view = account_revenue_view.rename(
    columns={
        "amount_paid": "gross_collected",
        "mrr": "subscription_mrr",
    }
)
account_revenue_view = account_revenue_view.drop(columns=["currency"])
account_revenue_view = account_revenue_view.dropna()

# Product usage and experiment enrichment
usage_feature_view = usage_events.merge(
    feature_flags,
    on="account_id",
    how="left",
)
usage_experiment_view = pd.merge(
    usage_feature_view,
    experiment_assignments,
    on="account_id",
    how="left",
)
usage_account_view = usage_experiment_view.merge(
    all_accounts,
    on="account_id",
    how="left",
)
usage_revenue_view = pd.merge(
    usage_account_view,
    account_revenue_view,
    on="account_id",
    how="left",
)
usage_revenue_view = usage_revenue_view.fillna(
    {
        "event_count": 0,
        "feature_flag": "unknown",
        "variant": "control",
        "gross_collected": 0,
    }
)
usage_revenue_view = usage_revenue_view.rename(
    columns={
        "event_count": "usage_events",
        "variant": "experiment_variant",
    }
)
usage_revenue_view = usage_revenue_view.drop(columns=["workspace_id"])
usage_revenue_view = usage_revenue_view.dropna()

# Multiple summaries from the same enriched dataframe
team_summary = ticket_feedback_view.groupby("account_team", as_index=False).count()
priority_summary = ticket_feedback_view.groupby("priority", as_index=False).sum()
region_summary = ticket_feedback_view.groupby("region", as_index=False).count()
source_summary = ticket_feedback_view.groupby("ticket_source", as_index=False).count()
market_summary = ticket_feedback_view.groupby("market", as_index=False).sum()
plan_summary = account_revenue_view.groupby("plan", as_index=False).sum()
product_summary = account_revenue_view.groupby("product_family", as_index=False).sum()
billing_status_summary = account_revenue_view.groupby("collection_status", as_index=False).count()
feature_summary = usage_revenue_view.groupby("feature_flag", as_index=False).sum()
experiment_summary = usage_revenue_view.groupby("experiment_variant", as_index=False).count()
usage_team_summary = usage_revenue_view.groupby("account_team", as_index=False).sum()

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
revenue_product_view = pd.merge(
    plan_summary,
    product_summary,
    left_on="plan",
    right_on="product_family",
    how="outer",
)
usage_experiment_rollup = feature_summary.merge(
    experiment_summary,
    left_on="feature_flag",
    right_on="experiment_variant",
    how="outer",
)
team_usage_revenue_view = pd.merge(
    usage_team_summary,
    team_summary,
    on="account_team",
    how="outer",
)
finance_health_view = revenue_product_view.merge(
    billing_status_summary,
    left_on="plan",
    right_on="collection_status",
    how="outer",
)
customer_360_view = pd.merge(
    ticket_feedback_view,
    usage_revenue_view,
    on="account_id",
    how="outer",
)
customer_360_view = customer_360_view.fillna(
    {
        "status": "unknown",
        "feature_flag": "unknown",
        "gross_collected": 0,
        "csat": 0,
    }
)
customer_360_view = customer_360_view.rename(
    columns={
        "status": "latest_ticket_status",
        "gross_collected": "lifetime_collected",
    }
)
customer_360_view = customer_360_view.drop(columns=["debug_flags"])
customer_360_view = customer_360_view.dropna()
customer_health_summary = customer_360_view.groupby("account_team", as_index=False).sum()

executive_dashboard = pd.concat(
    [
        team_priority_view,
        regional_market_view,
        source_summary,
        revenue_product_view,
        usage_experiment_rollup,
        team_usage_revenue_view,
        finance_health_view,
        customer_health_summary,
    ],
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
