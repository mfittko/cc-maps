import SwiftUI

struct WatchRootView: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "applewatch.radiowaves.left.and.right")
                .font(.system(size: 28))
                .foregroundStyle(.tint)

            Text("Cross-Country maps")
                .font(.headline)
                .multilineTextAlignment(.center)

            Text("Waiting for a planned route from iPhone.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Text("Phase 1 companion shell")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

#Preview {
    WatchRootView()
}