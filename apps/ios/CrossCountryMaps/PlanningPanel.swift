import SwiftUI

struct PlanningPanel: View {
    let plan: RoutePlanState
    let allTrails: [TrailFeature]
    let hydrationNotice: RoutePlanHydrationNotice?
    let selectedSectionEdgeID: String?
    let onExitPlanning: () -> Void
    let onReverse: () -> Void
    let onClear: () -> Void
    let onRemove: (String) -> Void
    let onSelectSection: (String) -> Void

    private var plannedSections: [PlanningSection] {
        GeoMath.planningSections(for: plan.anchorEdgeIDs, allTrails: allTrails)
    }

    private var trailsByID: [String: TrailFeature] {
        Dictionary(uniqueKeysWithValues: allTrails.map { ($0.id, $0) })
    }

    private var anchorListHeight: CGFloat {
        let rowHeight: CGFloat = 35
        return CGFloat(plannedSections.count) * rowHeight
    }

    private var scrollAreaMaxHeight: CGFloat {
        UIScreen.main.bounds.height * 0.35
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            if let hydrationNotice {
                hydrationBanner(hydrationNotice)
            }

            if plan.isEmpty {
                emptyState
            } else {
                ScrollView {
                    anchorList
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(height: min(anchorListHeight, scrollAreaMaxHeight))
                Divider()
                    .padding(.horizontal, 16)
                actionRow
            }
        }
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: Color.black.opacity(0.1), radius: 16, y: 6)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                .foregroundStyle(.blue)
            Text("Plan Route")
                .font(.headline.weight(.semibold))
            Spacer()
            Button(action: onExitPlanning) {
                Text("Done")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.blue)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Exit planning mode")
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 8)
    }

    private func hydrationBanner(_ hydrationNotice: RoutePlanHydrationNotice) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .font(.footnote)

            Text(hydrationNotice.message)
                .font(.footnote)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private var emptyState: some View {
        HStack(spacing: 8) {
            Image(systemName: "hand.tap")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text("Tap a trail to add it to your route")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
    }

    private var anchorList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(plannedSections.enumerated()), id: \.element.edgeID) { index, section in
                HStack(spacing: 10) {
                    Text("\(index + 1)")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(.primary)
                        .frame(width: 22, alignment: .trailing)

                    Text(trailLabel(for: section))
                        .font(.footnote)
                        .lineLimit(1)

                    Spacer(minLength: 0)

                    Button {
                        onRemove(section.edgeID)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .foregroundStyle(.red)
                            .font(.callout)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove section \(index + 1)")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .background(
                    (selectedSectionEdgeID == section.edgeID ? Color.blue.opacity(0.14) : Color.clear),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .contentShape(Rectangle())
                .onTapGesture {
                    onSelectSection(section.edgeID)
                }
                .accessibilityAddTraits(selectedSectionEdgeID == section.edgeID ? [.isSelected] : [])

                if index < plannedSections.count - 1 {
                    Divider()
                        .padding(.leading, 46)
                }
            }
        }
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            Text("\(plan.sectionCount) section\(plan.sectionCount == 1 ? "" : "s")")
                .font(.caption)
                .foregroundStyle(.secondary)

            Spacer(minLength: 0)

            Button(action: onReverse) {
                Label("Reverse", systemImage: "arrow.left.arrow.right")
                    .font(.caption.weight(.semibold))
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .tint(.primary)
            .accessibilityLabel("Reverse route order")

            Button(action: onClear) {
                Label("Clear", systemImage: "trash")
                    .font(.caption.weight(.semibold))
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .tint(.red)
            .accessibilityLabel("Clear all route sections")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func trailLabel(for section: PlanningSection) -> String {
        guard let trail = trailsByID[section.trailID] else {
            return section.formattedDistanceLabel
        }

        let distanceLabel = section.formattedDistanceLabel

        if trail.trailTypeSymbol == 30 {
            return distanceLabel
        }

        return "\(trail.trailTypeLabel) · \(distanceLabel)"
    }
}
