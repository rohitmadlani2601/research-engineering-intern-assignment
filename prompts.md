# AI-Assisted Development Prompts

This document tracks how AI (Claude) was used during development, including iterations, issues, and fixes.

---

## 1. Frontend UI Setup

**Component:** React Dashboard UI

**Prompt:**
Built a React frontend with a sidebar layout including tabs:
Overview, Topics, Time-series, Network, Embeddings, Chat.
Design should be minimalist, premium, and clean.

**Issue:**
Initial UI was too basic and lacked structure and visual hierarchy.

**Fix:**
Refined layout by introducing:

* consistent spacing
* card-based components
* sidebar navigation with active states

---

## 2. Network Graph Implementation

**Component:** Network Visualization

**Prompt:**
Create a network graph where:

* nodes represent users
* edges represent interactions
* node size is based on PageRank
* nodes are colored by community (Louvain)

**Issue:**
Initial graph was too dense and hard to interpret.

**Fix:**
Improved visualization by:

* limiting nodes to top N by PageRank
* filtering weak edges
* adding hover tooltips (user, score, community)
* adding side panel for top influencers

---

## 3. Network Graph Enhancements

**Component:** Network UX Improvements

**Prompt:**
Improve network graph clarity and usability with filtering and interactivity.

**Issue:**
Users could not easily explore graph insights.

**Fix:**
Added:

* community-based filtering
* click interaction to inspect users
* better layout and spacing

---

## 4. Embedding Visualization

**Component:** Embeddings Tab

**Prompt:**
Visualize embeddings in 2D using PCA:

* each point = post
* color by cluster
* allow hover interaction

**Issue:**
Graph was cluttered and difficult to interpret.

**Fix:**
Improved by:

* limiting number of points (sampling)
* adding hover preview (post text + cluster)
* adding legend for clusters

---

## 5. Embedding Visualization Enhancements

**Component:** Embedding UX Improvements

**Prompt:**
Improve embedding visualization using better projection and interaction.

**Issue:**
PCA visualization lost clarity in some clusters.

**Fix:**

* introduced optional UMAP for better separation
* added zoom and pan
* improved color differentiation

---

## 6. Storytelling UI

**Component:** Info Panels + Help Modal

**Prompt:**
Add contextual explanation for each tab:

* what it shows
* how it works
* what to observe

Also add a "?" button that opens a detailed explanation modal.

**Issue:**
Dashboard was not self-explanatory for new users.

**Fix:**
Implemented:

* reusable info panel component
* help modal with structured explanations
* consistent storytelling across all tabs

---

## 7. Chatbot Interface

**Component:** Chat Tab UI

**Prompt:**
Create a chatbot interface:

* input box
* response display
* show sources

**Issue:**
Initial responses were not clearly structured.

**Fix:**

* improved formatting
* added sources below answer
* added loading states

---

## Notes

* AI was primarily used for frontend structure, visualization, and UI improvements.
* Core backend logic (data processing, embeddings, clustering, APIs) was implemented and understood independently.
* Each AI-generated output was reviewed, modified, and integrated incrementally.

---