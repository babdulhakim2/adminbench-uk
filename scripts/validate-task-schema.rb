#!/usr/bin/env ruby
# frozen_string_literal: true

require 'yaml'

ROOT = File.expand_path('..', __dir__)
SCHEMA_PATH = File.join(ROOT, 'tasks', 'schema.yaml')
CATALOG_PATH = File.join(ROOT, 'tasks', 'v0.1.yaml')

class ValidationError < StandardError; end

def load_yaml(path)
  YAML.load_file(path)
rescue Psych::Exception => e
  raise ValidationError, "#{path}: invalid YAML: #{e.message}"
end

def fail_at(path, message)
  raise ValidationError, "#{path}: #{message}"
end

def type_ok?(value, type)
  case type
  when 'object' then value.is_a?(Hash)
  when 'array' then value.is_a?(Array)
  when 'string' then value.is_a?(String)
  when 'boolean' then value == true || value == false
  when 'null' then value.nil?
  else
    fail_at('$schema', "unsupported schema type #{type.inspect}")
  end
end

def schema_type_ok?(value, type)
  Array(type).any? { |candidate| type_ok?(value, candidate) }
end

def resolve_ref(schema, ref)
  unless ref.start_with?('#/$defs/')
    fail_at('$schema', "unsupported $ref #{ref.inspect}")
  end

  name = ref.split('/').last
  schema.fetch('$defs').fetch(name)
end

def validate_schema_node(schema, node_schema, value, path)
  node_schema = resolve_ref(schema, node_schema.fetch('$ref')) if node_schema.key?('$ref')

  if node_schema.key?('type') && !schema_type_ok?(value, node_schema.fetch('type'))
    fail_at(path, "expected #{Array(node_schema.fetch('type')).join(' or ')}, got #{value.class}")
  end

  if node_schema.key?('const') && value != node_schema.fetch('const')
    fail_at(path, "expected #{node_schema.fetch('const').inspect}, got #{value.inspect}")
  end

  if node_schema.key?('enum') && !node_schema.fetch('enum').include?(value)
    fail_at(path, "expected one of #{node_schema.fetch('enum').join(', ')}, got #{value.inspect}")
  end

  if value.is_a?(String)
    if node_schema.key?('minLength') && value.length < node_schema.fetch('minLength')
      fail_at(path, "must be at least #{node_schema.fetch('minLength')} characters")
    end
    if node_schema.key?('pattern') && !Regexp.new(node_schema.fetch('pattern')).match?(value)
      fail_at(path, "does not match #{node_schema.fetch('pattern')}")
    end
  end

  if value.is_a?(Array)
    if node_schema.key?('minItems') && value.length < node_schema.fetch('minItems')
      fail_at(path, "must contain at least #{node_schema.fetch('minItems')} item(s)")
    end
    item_schema = node_schema['items']
    value.each_with_index do |item, index|
      validate_schema_node(schema, item_schema, item, "#{path}[#{index}]") if item_schema
    end
  end

  return unless value.is_a?(Hash)

  required = node_schema.fetch('required', [])
  required.each do |key|
    fail_at(path, "missing required key #{key.inspect}") unless value.key?(key)
  end

  properties = node_schema.fetch('properties', {})
  if node_schema['additionalProperties'] == false
    extra_keys = value.keys - properties.keys
    fail_at(path, "unknown key(s): #{extra_keys.join(', ')}") unless extra_keys.empty?
  end

  properties.each do |key, child_schema|
    next unless value.key?(key)

    validate_schema_node(schema, child_schema, value[key], "#{path}.#{key}")
  end
end

def ensure_unique!(items, key, path)
  seen = {}
  items.each do |item|
    value = item.fetch(key)
    fail_at(path, "duplicate #{key} #{value.inspect}") if seen[value]

    seen[value] = true
  end
end

def ensure_ready_task!(task)
  id = task.fetch('id')
  implementation = task.fetch('implementation')

  return unless task.fetch('status') == 'ready'

  fail_at("tasks.#{id}.implementation.runnable", 'ready tasks must be runnable') unless implementation.fetch('runnable') == true

  %w[environment case_id seed portal_start_url documents_url].each do |key|
    value = implementation[key]
    fail_at("tasks.#{id}.implementation.#{key}", 'ready tasks must provide this value') if value.nil? || value.to_s.strip.empty?
  end

  required_artifacts = implementation.fetch('required_artifacts')
  expected_artifacts = %w[
    crm_seed
    source_documents
    portal_flow
    reset_seed
    smoke_test
    expected_outputs
    scoring_rules
    human_review
  ]
  missing_artifacts = expected_artifacts - required_artifacts
  fail_at("tasks.#{id}.implementation.required_artifacts", "missing #{missing_artifacts.join(', ')}") unless missing_artifacts.empty?

  fail_at("tasks.#{id}.source_documents", 'ready tasks must list source documents') if task.fetch('source_documents', []).empty?
  fail_at("tasks.#{id}.expected_outputs", 'ready tasks must define expected outputs') if task.fetch('expected_outputs', {}).empty?
  fail_at("tasks.#{id}.evidence_requirements", 'ready tasks must define evidence requirements') if task.fetch('evidence_requirements', []).empty?
end

def validate_semantics!(catalog)
  families = catalog.fetch('task_families')
  tasks = catalog.fetch('tasks')

  ensure_unique!(families, 'id', 'task_families')
  ensure_unique!(tasks, 'id', 'tasks')

  family_by_id = families.to_h { |family| [family.fetch('id'), family] }

  tasks.each do |task|
    id = task.fetch('id')
    family = family_by_id[task.fetch('family_id')]
    fail_at("tasks.#{id}.family_id", "unknown family #{task.fetch('family_id').inspect}") unless family

    %w[domain task_type].each do |key|
      next if task.fetch(key) == family.fetch(key)

      fail_at("tasks.#{id}.#{key}", "must match family #{family.fetch('id')} #{key} #{family.fetch(key).inspect}")
    end

    ensure_ready_task!(task)
  end
end

schema = load_yaml(SCHEMA_PATH)
catalog = load_yaml(CATALOG_PATH)

validate_schema_node(schema, schema, catalog, 'catalog')
validate_semantics!(catalog)

puts "Task catalog valid: #{CATALOG_PATH}"
