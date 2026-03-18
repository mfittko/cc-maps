require 'fileutils'

ENV['RBENV_VERSION'] ||= '3.3.9'

require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
PROJECT_NAME = 'CrossCountryMaps'
PROJECT_PATH = File.join(ROOT, "#{PROJECT_NAME}.xcodeproj")
IOS_TARGET_NAME = 'CrossCountryMaps'
WATCH_TARGET_NAME = 'CrossCountryMapsWatch'
IOS_TEST_TARGET_NAME = 'CrossCountryMapsTests'
IOS_BUNDLE_ID = 'com.mfittko.ccmaps'
WATCH_BUNDLE_ID = 'com.mfittko.ccmaps.watch'
IOS_TEST_BUNDLE_ID = 'com.mfittko.ccmaps.tests'
LAST_UPGRADE_CHECK = '1600'

def assign_target_settings(target, base_config:, debug_config:, release_config:, settings:)
  target.build_configuration_list.build_configurations.each do |config|
    config.base_configuration_reference = config.name == 'Debug' ? debug_config : release_config
    settings.each do |key, value|
      config.build_settings[key] = value
    end
  end
  target.build_configuration_list.default_configuration_name = 'Release'
  target.build_configuration_list.default_configuration_is_visible = '0'
  target.build_configurations
end

def add_sources(target, group, file_names)
  file_names.each do |file_name|
    file_ref = group.new_file(file_name)
    target.source_build_phase.add_file_reference(file_ref)
  end
end

def add_resources(target, group, file_names)
  file_names.each do |file_name|
    file_ref = group.new_file(file_name)
    target.resources_build_phase.add_file_reference(file_ref)
  end
end

FileUtils.rm_rf(PROJECT_PATH)

project = Xcodeproj::Project.new(PROJECT_PATH)
project.root_object.development_region = 'en'
project.root_object.attributes['LastUpgradeCheck'] = LAST_UPGRADE_CHECK
project.root_object.attributes['LastSwiftUpdateCheck'] = LAST_UPGRADE_CHECK
project.root_object.attributes['TargetAttributes'] = {}

main_group = project.main_group
config_group = main_group.new_group('Config', 'Config')
ios_group = main_group.new_group(IOS_TARGET_NAME, IOS_TARGET_NAME)
watch_group = main_group.new_group(WATCH_TARGET_NAME, WATCH_TARGET_NAME)
ios_test_group = main_group.new_group(IOS_TEST_TARGET_NAME, IOS_TEST_TARGET_NAME)

base_config = config_group.new_file('Base.xcconfig')
debug_config = config_group.new_file('Debug.xcconfig')
release_config = config_group.new_file('Release.xcconfig')

project.build_configuration_list.build_configurations.each do |config|
  config.base_configuration_reference = config.name == 'Debug' ? debug_config : release_config
end
project.build_configuration_list.default_configuration_name = 'Release'

ios_target = project.new_target(:application, IOS_TARGET_NAME, :ios, '17.0')
watch_target = project.new_target(:application, WATCH_TARGET_NAME, :watchos, '10.0')
ios_test_target = project.new_target(:unit_test_bundle, IOS_TEST_TARGET_NAME, :ios, '17.0')

project.root_object.attributes['TargetAttributes'][ios_target.uuid] = {
  'CreatedOnToolsVersion' => '16.2'
}
project.root_object.attributes['TargetAttributes'][watch_target.uuid] = {
  'CreatedOnToolsVersion' => '16.2'
}
project.root_object.attributes['TargetAttributes'][ios_test_target.uuid] = {
  'CreatedOnToolsVersion' => '16.2',
  'TestTargetID' => ios_target.uuid
}

assign_target_settings(
  ios_target,
  base_config: base_config,
  debug_config: debug_config,
  release_config: release_config,
  settings: {
    'ASSETCATALOG_COMPILER_APPICON_NAME' => 'AppIcon',
    'CODE_SIGN_ENTITLEMENTS' => '',
    'INFOPLIST_FILE' => 'CrossCountryMaps/Info.plist',
    'IPHONEOS_DEPLOYMENT_TARGET' => '17.0',
    'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/Frameworks',
    'PRODUCT_BUNDLE_IDENTIFIER' => IOS_BUNDLE_ID,
    'SDKROOT' => 'iphoneos',
    'SUPPORTED_PLATFORMS' => 'iphonesimulator iphoneos',
    'SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD' => 'NO',
    'SWIFT_EMIT_LOC_STRINGS' => 'YES',
    'TARGETED_DEVICE_FAMILY' => '1'
  }
)

assign_target_settings(
  watch_target,
  base_config: base_config,
  debug_config: debug_config,
  release_config: release_config,
  settings: {
    'ASSETCATALOG_COMPILER_APPICON_NAME' => 'AppIcon',
    'CODE_SIGN_ENTITLEMENTS' => '',
    'INFOPLIST_FILE' => 'CrossCountryMapsWatch/Info.plist',
    'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/Frameworks',
    'PRODUCT_BUNDLE_IDENTIFIER' => WATCH_BUNDLE_ID,
    'SDKROOT' => 'watchos',
    'SUPPORTED_PLATFORMS' => 'watchsimulator watchos',
    'SWIFT_EMIT_LOC_STRINGS' => 'YES',
    'TARGETED_DEVICE_FAMILY' => '4',
    'WATCHOS_DEPLOYMENT_TARGET' => '10.0'
  }
)

assign_target_settings(
  ios_test_target,
  base_config: base_config,
  debug_config: debug_config,
  release_config: release_config,
  settings: {
    'BUNDLE_LOADER' => '$(TEST_HOST)',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'IPHONEOS_DEPLOYMENT_TARGET' => '17.0',
    'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/Frameworks @loader_path/Frameworks',
    'PRODUCT_BUNDLE_IDENTIFIER' => IOS_TEST_BUNDLE_ID,
    'SDKROOT' => 'iphoneos',
    'SUPPORTED_PLATFORMS' => 'iphonesimulator iphoneos',
    'SWIFT_EMIT_LOC_STRINGS' => 'NO',
    'TARGETED_DEVICE_FAMILY' => '1',
    'TEST_HOST' => '$(BUILT_PRODUCTS_DIR)/CrossCountryMaps.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/CrossCountryMaps'
  }
)

add_sources(
  ios_target,
  ios_group,
  [
    'CrossCountryMapsApp.swift',
    'AppConfig.swift',
    'BrowseModels.swift',
    'LocationService.swift',
    'BrowseViewModel.swift',
    'TrailMapView.swift',
    'ContentView.swift'
  ]
)
add_resources(ios_target, ios_group, ['Assets.xcassets'])
ios_group.new_file('Info.plist')

add_sources(watch_target, watch_group, ['CrossCountryMapsWatchApp.swift', 'WatchRootView.swift'])
add_resources(watch_target, watch_group, ['Assets.xcassets'])
watch_group.new_file('Info.plist')

add_sources(
  ios_test_target,
  ios_test_group,
  [
    'BrowseContractTests.swift',
    'FixtureLoader.swift'
  ]
)

ios_target.add_dependency(watch_target)
ios_test_target.add_dependency(ios_target)
embed_watch_phase = ios_target.new_copy_files_build_phase('Embed Watch Content')
embed_watch_phase.dst_subfolder_spec = '16'
embed_watch_phase.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
embed_watch_phase.add_file_reference(watch_target.product_reference)

ios_scheme = Xcodeproj::XCScheme.new
ios_scheme.configure_with_targets(ios_target, ios_test_target)
ios_scheme.set_launch_target(ios_target)
ios_scheme.save_as(PROJECT_PATH, IOS_TARGET_NAME, true)

watch_scheme = Xcodeproj::XCScheme.new
watch_scheme.configure_with_targets(watch_target, nil)
watch_scheme.set_launch_target(watch_target)
watch_scheme.save_as(PROJECT_PATH, WATCH_TARGET_NAME, true)

project.save

puts "Generated #{PROJECT_PATH}"