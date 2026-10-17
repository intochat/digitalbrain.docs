#:property ManagePackageVersionsCentrally=false
#:property CodeGraphRefresh=false
#:package Microsoft.Orleans.Persistence.AzureStorage@10.3.1
#:package Microsoft.Orleans.Persistence.Memory@10.3.1

using System.Reflection;
using Orleans.Runtime;
using Orleans.Storage;

// Throwaway, read-only Task 0 probe: dotnet run --file docs/superpowers/probes/registry-storage-gate.cs
// Reflection inspects the installed provider; it is not a proposed inventory implementation.
var scope = "workspace-" + new string('a', 64);
var naming = typeof(AzureBlobGrainStorage).GetMethod("GetBlobName", BindingFlags.NonPublic | BindingFlags.Static)
    ?? throw new InvalidOperationException("Provider naming changed; re-evaluate the gate.");
string Name(string state, string type, string key) => (string)naming.Invoke(null, [state, GrainId.Create(type, key)])!;
string[] names = [Name("state", "known.type", scope + "/one"), Name("other", "unknown.type", scope + "/two")];
Console.WriteLine($"Azure provider: {typeof(AzureBlobGrainStorage).Assembly.GetName().Version}");
foreach (var name in names) { Console.WriteLine(name); }
var scopedPrefixWorks = names.All(name => name.StartsWith(scope + "/", StringComparison.Ordinal));
Console.WriteLine($"Brain-delimited blob prefix selects both state names/types: {scopedPrefixWorks}");
var methods = typeof(IMemoryStorageGrain).GetMethods().Select(method => method.Name).Order().ToArray();
Console.WriteLine($"Memory storage contract: {string.Join(", ", methods)}");
var pointOperations = new[] { "DeleteStateAsync", "ReadStateAsync", "WriteStateAsync" };
var memoryHasAdditionalOperation = methods.Except(pointOperations).Any();
Console.WriteLine($"Memory storage has an operation beyond point read/write/delete: {memoryHasAdditionalOperation}");
Console.WriteLine("FAIL: Task 0 is not proven. No storage was written or replaced.");
return 1;
